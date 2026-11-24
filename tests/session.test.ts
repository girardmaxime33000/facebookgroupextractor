import { describe, expect, it } from "vitest";
import { buildContextOptions, createSession, parseProxyUrl } from "../src/facebook/session.js";

describe("parseProxyUrl", () => {
  it("parse identifiants et serveur", () => {
    expect(parseProxyUrl("http://us%40er:p%3Ass@proxy.example.com:8000")).toEqual({
      server: "http://proxy.example.com:8000",
      username: "us@er",
      password: "p:ss",
    });
    expect(parseProxyUrl("socks5://10.0.0.1:1080")).toEqual({ server: "socks5://10.0.0.1:1080" });
  });
  it("rejette les valeurs invalides", () => {
    expect(parseProxyUrl("proxy")).toBeNull();
    expect(parseProxyUrl("ftp://h:1")).toBeNull();
  });
});

describe("buildContextOptions", () => {
  it("n'ajoute pas de proxy sans PROXY_URL", () => {
    expect(buildContextOptions({}, {}).proxy).toBeUndefined();
  });
  it("lit PROXY_URL depuis l'environnement", () => {
    expect(buildContextOptions({}, { PROXY_URL: "http://h:1" }).proxy?.server).toBe("http://h:1");
  });
  it("l'option prime sur l'environnement", () => {
    expect(buildContextOptions({ proxyUrl: "http://a:2" }, { PROXY_URL: "http://h:1" }).proxy?.server).toBe("http://a:2");
  });
  it("lève une erreur si PROXY_URL est invalide", () => {
    expect(() => buildContextOptions({}, { PROXY_URL: "nope" })).toThrow(/PROXY_URL/);
  });
});

describe("createSession", () => {
  it("ouvre et ferme un contexte anonyme sans cookies", async () => {
    const s = await createSession();
    expect(await s.context.cookies()).toEqual([]);
    await s.close();
  });
});
