import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { extractPost } from "../src/facebook/extract.js";
import { COLUMN_NAMES, FORMATS, csvEscape, toCsv, toHtml, toJson, toJsonl, toXml, toXlsx, writeDataset, xmlEscape } from "../src/output/index.js";
import { rawPost } from "./helpers.js";

const mk = (text: string, legacyId = "1") =>
  extractPost(rawPost({ text, legacyId }), { inputUrl: "https://www.facebook.com/groups/874728723021553" });

const tricky = 'a,"b"\nc <x> & \u0001';

describe("writers", () => {
  const posts = [mk(tricky, "1"), mk("simple", "2")];

  it("json et jsonl se relisent à l'identique", () => {
    expect(JSON.parse(toJson(posts))).toEqual(posts);
    const lines = toJsonl(posts).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => JSON.parse(l))).toEqual(posts);
  });

  it("csv échappe virgules, guillemets et retours à la ligne", () => {
    expect(csvEscape('a,"b"')).toBe('"a,""b"""');
    const csv = toCsv(posts);
    expect(csv.split("\r\n")[0]).toBe(COLUMN_NAMES.join(","));
    expect(csv).toContain('"a,""b""\nc <x> & \u0001"');
  });

  it("xml échappe les caractères spéciaux et retire les contrôles", () => {
    expect(xmlEscape(`<&>"'\u0001`)).toBe("&lt;&amp;&gt;&quot;&apos;");
    const xml = toXml(posts);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<user><id>100001</id><name>Alice</name></user>");
    expect(xml).toContain("&lt;x&gt; &amp;");
    expect(xml).not.toContain("\u0001");
  });

  it("html échappe le contenu", () => {
    const html = toHtml(posts);
    expect(html).toContain("&lt;x&gt; &amp;");
    expect(html).not.toContain("<x>");
  });

  it("xlsx contient l'en-tête et une ligne par post", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await toXlsx(posts)) as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet("posts")!;
    expect(ws.rowCount).toBe(3);
    expect(ws.getRow(1).getCell(1).value).toBe("facebookUrl");
    expect(ws.getRow(3).getCell(COLUMN_NAMES.indexOf("legacyId") + 1).value).toBe("2");
  });

  it("writeDataset écrit un fichier par format", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fbg-"));
    for (const f of FORMATS) {
      const path = await writeDataset(posts, f, dir);
      expect(path).toBe(join(dir, `dataset.${f}`));
      expect((await readFile(path)).length).toBeGreaterThan(0);
    }
  });
});
