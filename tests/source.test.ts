import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { ExtractionError } from "../src/errors.js";
import { readFeed } from "../src/facebook/feed.js";
import { createSession } from "../src/facebook/session.js";
import { PlaywrightSource, classifyNavigation } from "../src/facebook/source.js";
import { rawPost } from "./helpers.js";

describe("classifyNavigation", () => {
  it("détecte la page de connexion, 404 et blocages", () => {
    expect(classifyNavigation("https://www.facebook.com/login/?next=x", 200)?.code).toBe("LOGIN_REQUIRED");
    expect(classifyNavigation("https://www.facebook.com/checkpoint/1", 200)?.code).toBe("LOGIN_REQUIRED");
    expect(classifyNavigation("https://www.facebook.com/groups/x", 404)?.code).toBe("NOT_FOUND");
    expect(classifyNavigation("https://www.facebook.com/groups/x", 429)?.code).toBe("BLOCKED");
    expect(classifyNavigation("https://www.facebook.com/groups/x", 200)).toBeNull();
  });
});

describe("PlaywrightSource (serveur local)", () => {
  async function withServer(handler: Parameters<typeof createServer>[1], fn: (base: string) => Promise<void>) {
    const s = createServer(handler);
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
    try {
      await fn(`http://127.0.0.1:${(s.address() as AddressInfo).port}`);
    } finally {
      s.close();
    }
  }

  it("intercepte les réponses JSON et les convertit via le parseur", async () => {
    await withServer(
      (req, res) => {
        if (req.url === "/api/graphql") {
          res.writeHead(200, { "content-type": "application/json" });
          return void res.end(JSON.stringify({ ids: ["1", "2"] }));
        }
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<html><body><script>fetch("/api/graphql",{method:"POST"})</script></body></html>`);
      },
      async (base) => {
        const session = await createSession({ proxyUrl: undefined });
        try {
          const source = new PlaywrightSource(session, `${base}/groups/1`, {
            settleMs: 3000,
            parser: (body) => ({ posts: (JSON.parse(body) as { ids: string[] }).ids.map((legacyId) => rawPost({ legacyId })) }),
          });
          const ids: string[] = [];
          for await (const p of readFeed(source, { maxPages: 3 })) ids.push(p.legacyId);
          await source.close();
          expect(ids).toEqual(["1", "2"]);
        } finally {
          await session.close();
        }
      },
    );
  }, 30_000);

  it("lève NOT_IMPLEMENTED sans parseur et NOT_FOUND sur 404", async () => {
    await withServer(
      (req, res) => {
        res.writeHead(req.url?.includes("missing") ? 404 : 200, { "content-type": "text/html" });
        res.end("<html></html>");
      },
      async (base) => {
        const session = await createSession({ proxyUrl: undefined });
        try {
          const noParser = new PlaywrightSource(session, `${base}/groups/1`);
          await expect(noParser.fetchPage()).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
          const missing = new PlaywrightSource(session, `${base}/groups/missing`, { parser: () => null });
          const e = await missing.fetchPage().catch((x: unknown) => x);
          expect(e).toBeInstanceOf(ExtractionError);
          expect((e as ExtractionError).code).toBe("NOT_FOUND");
        } finally {
          await session.close();
        }
      },
    );
  }, 30_000);
});
