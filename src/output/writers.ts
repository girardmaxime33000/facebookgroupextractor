import ExcelJS from "exceljs";
import type { Post } from "../model/index.js";
import { COLUMN_NAMES, flattenPost } from "./flatten.js";

export const FORMATS = ["json", "jsonl", "csv", "xlsx", "html", "xml"] as const;
export type Format = (typeof FORMATS)[number];

export const EXTENSIONS: Record<Format, string> = { json: "json", jsonl: "jsonl", csv: "csv", xlsx: "xlsx", html: "html", xml: "xml" };

const cell = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export function csvEscape(v: unknown): string {
  const s = cell(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function xmlEscape(v: unknown): string {
  // Caractères de contrôle interdits en XML 1.0 supprimés.
  return cell(v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const toJson = (posts: Post[]): string => JSON.stringify(posts, null, 2) + "\n";
export const toJsonl = (posts: Post[]): string => posts.map((p) => JSON.stringify(p) + "\n").join("");

export function toCsv(posts: Post[]): string {
  const lines = [COLUMN_NAMES.map(csvEscape).join(",")];
  for (const p of posts) {
    const row = flattenPost(p);
    lines.push(COLUMN_NAMES.map((c) => csvEscape(row[c])).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

export function toHtml(posts: Post[]): string {
  const head = COLUMN_NAMES.map((c) => `<th>${xmlEscape(c)}</th>`).join("");
  const body = posts
    .map((p) => {
      const row = flattenPost(p);
      return `<tr>${COLUMN_NAMES.map((c) => `<td>${xmlEscape(row[c])}</td>`).join("")}</tr>`;
    })
    .join("\n");
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>Posts</title></head><body>\n<table border="1">\n<thead><tr>${head}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table>\n</body></html>\n`;
}

const xmlNode = (name: string, v: unknown): string => {
  if (Array.isArray(v)) return `<${name}>${v.map((i) => xmlNode("item", i)).join("")}</${name}>`;
  if (v !== null && typeof v === "object") {
    return `<${name}>${Object.entries(v).map(([k, x]) => xmlNode(k, x)).join("")}</${name}>`;
  }
  return `<${name}>${xmlEscape(v)}</${name}>`;
};

export function toXml(posts: Post[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<posts>\n${posts.map((p) => xmlNode("post", p)).join("\n")}\n</posts>\n`;
}

export async function toXlsx(posts: Post[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("posts");
  ws.addRow([...COLUMN_NAMES]);
  for (const p of posts) {
    const row = flattenPost(p);
    ws.addRow(COLUMN_NAMES.map((c) => row[c] ?? null));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function serialize(posts: Post[], format: Format): Promise<string | Buffer> {
  switch (format) {
    case "json": return toJson(posts);
    case "jsonl": return toJsonl(posts);
    case "csv": return toCsv(posts);
    case "html": return toHtml(posts);
    case "xml": return toXml(posts);
    case "xlsx": return toXlsx(posts);
  }
}
