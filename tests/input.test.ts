import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { parseInput } from "../src/input/index.js";
import { parseNewerThan } from "../src/input/dates.js";
import { parseGroupUrl } from "../src/input/url.js";

const now = new Date("2025-06-15T12:00:00.000Z");

describe("parseNewerThan", () => {
  it("parse les dates absolues en UTC", () => {
    expect(parseNewerThan("2024-01-01")?.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(parseNewerThan("2024-01-01T10:30:00")?.toISOString()).toBe("2024-01-01T10:30:00.000Z");
    expect(parseNewerThan("2024-01-01T10:30:00Z")?.toISOString()).toBe("2024-01-01T10:30:00.000Z");
    expect(parseNewerThan("2024-03")?.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    expect(parseNewerThan("2024")?.toISOString()).toBe("2024-01-01T00:00:00.000Z");
  });
  it("parse les dates relatives", () => {
    expect(parseNewerThan("2 days", now)?.toISOString()).toBe("2025-06-13T12:00:00.000Z");
    expect(parseNewerThan("1 hour", now)?.toISOString()).toBe("2025-06-15T11:00:00.000Z");
    expect(parseNewerThan("2 minutes", now)?.toISOString()).toBe("2025-06-15T11:58:00.000Z");
    expect(parseNewerThan("2 months", now)?.toISOString()).toBe("2025-04-15T12:00:00.000Z");
    expect(parseNewerThan("3 years", now)?.toISOString()).toBe("2022-06-15T12:00:00.000Z");
  });
  it("rejette les valeurs invalides", () => {
    for (const v of ["", "hier", "2 lightyears", "2024-13-45", "-1 days", "yesterday"]) {
      expect(parseNewerThan(v, now)).toBeNull();
    }
  });
});

describe("parseGroupUrl", () => {
  it("accepte id et slug", () => {
    expect(parseGroupUrl("https://www.facebook.com/groups/874728723021553")?.idOrSlug).toBe("874728723021553");
    expect(parseGroupUrl("https://facebook.com/groups/my.group/?ref=x")?.url).toBe(
      "https://www.facebook.com/groups/my.group",
    );
  });
  it("rejette les URLs invalides", () => {
    for (const u of [
      "not a url",
      "https://example.com/groups/123",
      "https://www.facebook.com/pages/123",
      "https://www.facebook.com/groups/",
      "ftp://www.facebook.com/groups/1",
      "https://facebook.com.evil.com/groups/1",
    ]) {
      expect(parseGroupUrl(u)).toBeNull();
    }
  });
});

describe("parseInput", () => {
  const url = "https://www.facebook.com/groups/874728723021553";

  it("applique les défauts", () => {
    const r = parseInput({ startUrls: [{ url }] }, now);
    expect(r.viewOption).toBe("CHRONOLOGICAL");
    expect(r.resultsLimit).toBeUndefined();
    expect(r.newerThan).toBeUndefined();
    expect(r.groups[0]).toEqual({ inputUrl: url, idOrSlug: "874728723021553", url });
  });
  it("parse l'exemple de la spec", () => {
    const r = parseInput(
      { startUrls: [{ url }], resultsLimit: 20, viewOption: "CHRONOLOGICAL", onlyPostsNewerThan: "2024-01-01" },
      now,
    );
    expect(r.resultsLimit).toBe(20);
    expect(r.newerThan?.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(r.warnings).toEqual([]);
  });
  it("ignore onlyPostsNewerThan avec avertissement hors CHRONOLOGICAL", () => {
    const r = parseInput({ startUrls: [{ url }], viewOption: "TOP_POSTS", onlyPostsNewerThan: "2 days" }, now);
    expect(r.newerThan).toBeUndefined();
    expect(r.warnings).toHaveLength(1);
  });
  it("rejette startUrls vide ou absent", () => {
    expect(() => parseInput({ startUrls: [] })).toThrow(ZodError);
    expect(() => parseInput({})).toThrow(ZodError);
  });
  it("rejette une URL non-groupe", () => {
    expect(() => parseInput({ startUrls: [{ url: "https://example.com" }] })).toThrow(ZodError);
  });
  it("rejette resultsLimit < 1 ou non entier", () => {
    expect(() => parseInput({ startUrls: [{ url }], resultsLimit: 0 })).toThrow(ZodError);
    expect(() => parseInput({ startUrls: [{ url }], resultsLimit: 1.5 })).toThrow(ZodError);
  });
  it("rejette viewOption et date invalides", () => {
    expect(() => parseInput({ startUrls: [{ url }], viewOption: "RANDOM" })).toThrow(ZodError);
    expect(() => parseInput({ startUrls: [{ url }], onlyPostsNewerThan: "bientôt" })).toThrow(ZodError);
  });
});
