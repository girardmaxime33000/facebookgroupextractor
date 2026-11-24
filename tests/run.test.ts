import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ExtractionError } from "../src/errors.js";
import type { PostSource } from "../src/facebook/feed.js";
import { parseInput } from "../src/input/index.js";
import { enrichWithOcr } from "../src/ocr.js";
import { runExtraction, type SourceFactory } from "../src/run.js";
import { extractPost } from "../src/facebook/extract.js";
import { rawPost } from "./helpers.js";

const url = (id: string) => ({ url: `https://www.facebook.com/groups/${id}` });
const memorySource = (ids: string[]): PostSource => ({
  async fetchPage() {
    return { posts: ids.map((id) => rawPost({ legacyId: id })), nextCursor: null };
  },
});

describe("runExtraction", () => {
  it("consigne l'erreur d'un groupe sans arrêter les autres", async () => {
    const factory: SourceFactory = async (g) => {
      if (g.idOrSlug === "private") throw new ExtractionError("LOGIN_REQUIRED", "privé");
      return { source: memorySource(["1", "2"]) };
    };
    const r = await runExtraction(parseInput({ startUrls: [url("a"), url("private"), url("b")] }), { sourceFactory: factory });
    expect(r.posts).toHaveLength(4);
    expect(r.errors).toEqual([{ inputUrl: "https://www.facebook.com/groups/private", code: "LOGIN_REQUIRED", message: "privé" }]);
  });

  it("classe les erreurs inattendues en UNKNOWN", async () => {
    const factory: SourceFactory = async () => {
      throw new Error("boom");
    };
    const r = await runExtraction(parseInput({ startUrls: [url("a")] }), { sourceFactory: factory });
    expect(r.errors[0]).toMatchObject({ code: "UNKNOWN", message: "boom" });
  });

  it("réessaie avec backoff sur BLOCKED puis réussit", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const factory: SourceFactory = async () => {
      if (++calls < 3) throw new ExtractionError("BLOCKED", "429");
      return { source: memorySource(["1"]) };
    };
    const r = await runExtraction(parseInput({ startUrls: [url("a")] }), {
      sourceFactory: factory,
      backoffMs: 10,
      sleep: async (ms) => void sleeps.push(ms),
    });
    expect(r.posts).toHaveLength(1);
    expect(sleeps).toEqual([10, 20]);
  });

  it("n'essaie pas de nouveau un groupe privé", async () => {
    let calls = 0;
    const factory: SourceFactory = async () => {
      calls++;
      throw new ExtractionError("LOGIN_REQUIRED", "x");
    };
    await runExtraction(parseInput({ startUrls: [url("a")] }), { sourceFactory: factory });
    expect(calls).toBe(1);
  });

  it("applique resultsLimit par groupe et conserve l'ordre des URLs", async () => {
    const factory: SourceFactory = async (g) => ({ source: memorySource([`${g.idOrSlug}1`, `${g.idOrSlug}2`, `${g.idOrSlug}3`]) });
    const r = await runExtraction(parseInput({ startUrls: [url("a"), url("b")], resultsLimit: 2 }), {
      sourceFactory: factory,
      concurrency: 2,
    });
    expect(r.posts.map((p) => p.legacyId)).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("relance idempotente : aucun doublon avec l'état persisté", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "fbg-state-"));
    const factory: SourceFactory = async () => ({ source: memorySource(["1", "2"]) });
    const input = parseInput({ startUrls: [url("a")] });
    const first = await runExtraction(input, { sourceFactory: factory, stateDir });
    const second = await runExtraction(input, { sourceFactory: factory, stateDir });
    expect(first.posts).toHaveLength(2);
    expect(second.posts).toHaveLength(0);
    expect(JSON.parse(await readFile(join(stateDir, "state.json"), "utf8")).a.seenIds).toEqual(["1", "2"]);
  });

  it("remonte les avertissements de l'entrée", async () => {
    const r = await runExtraction(
      parseInput({ startUrls: [url("a")], viewOption: "TOP_POSTS", onlyPostsNewerThan: "2 days" }),
      { sourceFactory: async () => ({ source: memorySource([]) }) },
    );
    expect(r.warnings).toHaveLength(1);
  });
});

describe("enrichWithOcr", () => {
  it("ajoute ocrText aux photos et tolère les échecs", async () => {
    const post = extractPost(
      rawPost({
        attachments: [
          { type: "photo", url: "https://x/ok.jpg" },
          { type: "photo", url: "https://x/ko.jpg" },
          { type: "video", url: "https://x/v.mp4" },
        ],
      }),
      { inputUrl: "u" },
    );
    await enrichWithOcr([post], {
      async recognize(u) {
        if (u.includes("ko")) throw new Error("fail");
        return " texte ";
      },
    });
    expect(post.attachments?.map((a) => a.ocrText)).toEqual(["texte", undefined, undefined]);
  });
});
