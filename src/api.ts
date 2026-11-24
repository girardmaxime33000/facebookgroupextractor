import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { parseInput } from "./input/index.js";
import { FORMATS, serialize, type Format } from "./output/index.js";
import type { Post } from "./model/index.js";
import { runExtraction, type GroupError, type SourceFactory } from "./run.js";

interface RunRecord {
  id: string;
  status: "running" | "done" | "failed";
  posts: Post[];
  errors: GroupError[];
  warnings: string[];
  failure?: string;
}

const CONTENT_TYPES: Record<Format, string> = {
  json: "application/json",
  jsonl: "application/x-ndjson",
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  html: "text/html; charset=utf-8",
  xml: "application/xml; charset=utf-8",
};

const MAX_BODY = 1_000_000;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("corps trop volumineux"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** API HTTP : POST /runs, GET /runs/:id, GET /runs/:id/dataset?format=. Runs conservés en mémoire. */
export function createApi(sourceFactory: SourceFactory): Server {
  const runs = new Map<string, RunRecord>();

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);

      if (req.method === "POST" && url.pathname === "/runs") {
        let input;
        try {
          input = parseInput(JSON.parse(await readBody(req)));
        } catch (e) {
          const message = e instanceof ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) : "JSON invalide";
          return send(res, 400, { error: message });
        }
        const rec: RunRecord = { id: randomUUID(), status: "running", posts: [], errors: [], warnings: input.warnings };
        runs.set(rec.id, rec);
        runExtraction(input, { sourceFactory }).then(
          (r) => Object.assign(rec, { status: "done", posts: r.posts, errors: r.errors }),
          (e: unknown) => Object.assign(rec, { status: "failed", failure: e instanceof Error ? e.message : String(e) }),
        );
        return send(res, 202, { id: rec.id, status: rec.status });
      }

      if (req.method === "GET" && parts[0] === "runs" && parts[1]) {
        const rec = runs.get(parts[1]);
        if (!rec) return send(res, 404, { error: "run inconnu" });
        if (parts.length === 2) {
          return send(res, 200, {
            id: rec.id, status: rec.status, count: rec.posts.length, errors: rec.errors, warnings: rec.warnings,
            ...(rec.failure && { failure: rec.failure }),
          });
        }
        if (parts[2] === "dataset" && parts.length === 3) {
          const format = (url.searchParams.get("format") ?? "json") as Format;
          if (!FORMATS.includes(format)) return send(res, 400, { error: `format inconnu: ${format}` });
          if (rec.status === "running") return send(res, 409, { error: "run en cours" });
          res.writeHead(200, { "content-type": CONTENT_TYPES[format] });
          return void res.end(await serialize(rec.posts, format));
        }
      }
      send(res, 404, { error: "introuvable" });
    } catch (e) {
      send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });
}
