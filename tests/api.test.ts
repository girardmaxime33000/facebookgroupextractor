import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApi } from "../src/api.js";
import type { SourceFactory } from "../src/run.js";
import { rawPost } from "./helpers.js";

const factory: SourceFactory = async () => ({
  source: { fetchPage: async () => ({ posts: [rawPost({ legacyId: "1" })], nextCursor: null }) },
});
const servers: ReturnType<typeof createApi>[] = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

async function start() {
  const s = createApi(factory);
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}
const G = { url: "https://www.facebook.com/groups/874728723021553" };

async function waitDone(base: string, id: string) {
  for (let i = 0; i < 50; i++) {
    const r = (await (await fetch(`${base}/runs/${id}`)).json()) as { status: string };
    if (r.status !== "running") return r;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timeout");
}

describe("api", () => {
  it("POST /runs puis GET statut et dataset", async () => {
    const base = await start();
    const res = await fetch(`${base}/runs`, { method: "POST", body: JSON.stringify({ startUrls: [G] }) });
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };
    expect(await waitDone(base, id)).toMatchObject({ status: "done", count: 1 });
    const csv = await fetch(`${base}/runs/${id}/dataset?format=csv`);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const json = (await (await fetch(`${base}/runs/${id}/dataset`)).json()) as { legacyId: string }[];
    expect(json[0]?.legacyId).toBe("1");
  });

  it("400 sur entrée invalide, 404 sur run inconnu, 400 sur format inconnu", async () => {
    const base = await start();
    expect((await fetch(`${base}/runs`, { method: "POST", body: "{}" })).status).toBe(400);
    expect((await fetch(`${base}/runs`, { method: "POST", body: "pas du json" })).status).toBe(400);
    expect((await fetch(`${base}/runs/nope`)).status).toBe(404);
    const { id } = (await (await fetch(`${base}/runs`, { method: "POST", body: JSON.stringify({ startUrls: [G] }) })).json()) as { id: string };
    await waitDone(base, id);
    expect((await fetch(`${base}/runs/${id}/dataset?format=pdf`)).status).toBe(400);
  });
});
