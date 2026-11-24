import { describe, expect, it } from "vitest";
import { readFeed, type PostSource, type RawPage } from "../src/facebook/feed.js";
import type { RawPost } from "../src/model/index.js";
import { rawPost } from "./helpers.js";

const post = (n: number, createdAt: number): RawPost => rawPost({ legacyId: String(n), createdAt });

/** Source en mémoire : pages indexées par curseur. */
function source(pages: Record<string, RawPage>, calls: (string | undefined)[] = []): PostSource {
  return {
    async fetchPage(cursor) {
      calls.push(cursor);
      return pages[cursor ?? "start"] ?? { posts: [] };
    },
  };
}

const collect = async (gen: AsyncGenerator<RawPost>): Promise<string[]> => {
  const ids: string[] = [];
  for await (const p of gen) ids.push(p.legacyId);
  return ids;
};

const day = 86_400;
const base = Date.UTC(2025, 5, 15) / 1000;

describe("readFeed", () => {
  const pages = {
    start: { posts: [post(1, base), post(2, base - day)], nextCursor: "c1" },
    c1: { posts: [post(3, base - 2 * day), post(4, base - 3 * day)], nextCursor: "c2" },
    c2: { posts: [post(5, base - 4 * day)], nextCursor: null },
  };

  it("lit toutes les pages jusqu'à la fin du flux", async () => {
    expect(await collect(readFeed(source(pages)))).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("s'arrête à resultsLimit sans charger la page suivante", async () => {
    const calls: (string | undefined)[] = [];
    expect(await collect(readFeed(source(pages, calls), { resultsLimit: 2 }))).toEqual(["1", "2"]);
    expect(calls).toEqual([undefined]);
  });

  it("s'arrête au premier post plus ancien que newerThan (CHRONOLOGICAL)", async () => {
    const newerThan = new Date((base - 2 * day) * 1000);
    expect(await collect(readFeed(source(pages), { newerThan }))).toEqual(["1", "2", "3"]);
  });

  it("ignore newerThan hors CHRONOLOGICAL", async () => {
    const newerThan = new Date(base * 1000);
    const ids = await collect(readFeed(source(pages), { newerThan, viewOption: "TOP_POSTS" }));
    expect(ids).toHaveLength(5);
  });

  it("dédoublonne et met à jour seenIds (relance idempotente)", async () => {
    const seenIds = new Set<string>();
    await collect(readFeed(source(pages), { seenIds, resultsLimit: 3 }));
    expect([...seenIds]).toEqual(["1", "2", "3"]);
    expect(await collect(readFeed(source(pages), { seenIds }))).toEqual(["4", "5"]);
  });

  it("dédoublonne les posts répétés entre pages", async () => {
    const dup = {
      start: { posts: [post(1, base)], nextCursor: "c1" },
      c1: { posts: [post(1, base), post(2, base - day)], nextCursor: null },
    };
    expect(await collect(readFeed(source(dup)))).toEqual(["1", "2"]);
  });

  it("reprend depuis startCursor et notifie les curseurs", async () => {
    const cursors: (string | null)[] = [];
    const ids = await collect(readFeed(source(pages), { startCursor: "c1", onCursor: (c) => cursors.push(c) }));
    expect(ids).toEqual(["3", "4", "5"]);
    expect(cursors).toEqual(["c2", null]);
  });

  it("s'arrête sur curseur répété ou page vide", async () => {
    const loop = { start: { posts: [post(1, base)], nextCursor: "c1" }, c1: { posts: [post(2, base)], nextCursor: "c1" } };
    expect(await collect(readFeed(source(loop)))).toEqual(["1", "2"]);
    const empty = { start: { posts: [], nextCursor: "c1" } };
    expect(await collect(readFeed(source(empty)))).toEqual([]);
  });

  it("respecte maxPages", async () => {
    const calls: (string | undefined)[] = [];
    await collect(readFeed(source(pages, calls), { maxPages: 2 }));
    expect(calls).toHaveLength(2);
  });
});
