import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { ExtractionError } from "../src/errors.js";
import type { SourceFactory } from "../src/run.js";
import { rawPost } from "./helpers.js";

const ok: SourceFactory = async () => ({
  source: { fetchPage: async () => ({ posts: [rawPost({ legacyId: "1" }), rawPost({ legacyId: "2" })], nextCursor: null }) },
});
const run = async (args: string[], factory = ok) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(args, { sourceFactory: factory, stdout: (s) => out.push(s), stderr: (s) => err.push(s) });
  return { code, out: out.join("\n"), err: err.join("\n") };
};
const G = "https://www.facebook.com/groups/874728723021553";

describe("cli", () => {
  it("écrit le dataset jsonl", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fbg-cli-"));
    const r = await run(["--url", G, "--limit", "1", "--out", dir]);
    expect(r.code).toBe(0);
    const lines = (await readFile(join(dir, "dataset.jsonl"), "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).legacyId).toBe("1");
  });

  it("lit --input et applique les surcharges CLI", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fbg-cli-"));
    const file = join(dir, "in.json");
    await writeFile(file, JSON.stringify({ startUrls: [{ url: G }], resultsLimit: 2 }));
    const r = await run(["--input", file, "--limit", "1", "--format", "csv", "--out", dir]);
    expect(r.code).toBe(0);
    expect((await readFile(join(dir, "dataset.csv"), "utf8")).trim().split("\r\n")).toHaveLength(2);
  });

  it("code 2 sur entrée invalide", async () => {
    const r = await run(["--url", "https://example.com"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("startUrls");
  });

  it("code 2 sans URL, format inconnu ou option inconnue", async () => {
    expect((await run([])).code).toBe(2);
    expect((await run(["--url", G, "--format", "pdf"])).code).toBe(2);
    expect((await run(["--nope"])).code).toBe(2);
  });

  it("code 1 si un groupe échoue, dataset écrit pour les autres", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fbg-cli-"));
    const factory: SourceFactory = async (g) => {
      if (g.idOrSlug === "priv") throw new ExtractionError("LOGIN_REQUIRED", "privé");
      return ok(g);
    };
    const r = await run(["--url", G, "--url", "https://www.facebook.com/groups/priv", "--out", dir], factory);
    expect(r.code).toBe(1);
    expect(r.err).toContain("LOGIN_REQUIRED");
    expect(r.out).toContain("2 post(s)");
  });

  it("--help", async () => {
    const r = await run(["--help"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Usage");
  });
});
