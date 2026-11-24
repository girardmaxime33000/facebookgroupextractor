#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { ZodError } from "zod";
import { createBrowserSourceFactory } from "./defaults.js";
import { parseInput, VIEW_OPTIONS } from "./input/index.js";
import { FORMATS, writeDataset, type Format } from "./output/index.js";
import { runExtraction, type SourceFactory } from "./run.js";

const USAGE = `Usage: fbgroups --url <url> [--url <url>...] [options]
       fbgroups --input input.json [options]

Options:
  --url <url>          URL de groupe public (répétable)
  --input <fichier>    Entrée JSON (contrat SPEC §3)
  --limit <n>          Nombre max de posts par groupe
  --sort <option>      ${VIEW_OPTIONS.join(" | ")}
  --since <date>       Date absolue (2024-01-01) ou relative ("2 days")
  --format <fmt>       ${FORMATS.join(" | ")} (défaut: jsonl)
  --out <dossier>      Dossier de sortie (défaut: out)
  --resume             Reprend avec l'état persisté (dédoublonnage entre exécutions)
  --concurrency <n>    Groupes traités en parallèle (défaut: 1)
  --proxy <url>        Proxy (défaut: variable PROXY_URL)
  -h, --help
`;

export interface CliDeps {
  sourceFactory?: SourceFactory;
  stdout?: (s: string) => void;
  stderr?: (s: string) => void;
}

/** Retourne le code de sortie : 0 ok, 1 erreurs sur certains groupes, 2 usage/entrée invalide. */
export async function main(argv: string[], deps: CliDeps = {}): Promise<number> {
  const out = deps.stdout ?? ((s) => process.stdout.write(s + "\n"));
  const err = deps.stderr ?? ((s) => process.stderr.write(s + "\n"));

  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        url: { type: "string", multiple: true },
        input: { type: "string" },
        limit: { type: "string" },
        sort: { type: "string" },
        since: { type: "string" },
        format: { type: "string", default: "jsonl" },
        out: { type: "string", default: "out" },
        resume: { type: "boolean", default: false },
        concurrency: { type: "string", default: "1" },
        proxy: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (e) {
    err(`${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    out(USAGE);
    return 0;
  }

  const format = values.format as Format;
  if (!FORMATS.includes(format)) {
    err(`Format inconnu: ${values.format}`);
    return 2;
  }
  const concurrency = Number(values.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    err("--concurrency doit être un entier >= 1");
    return 2;
  }

  let raw: Record<string, unknown>;
  try {
    raw = values.input ? (JSON.parse(await readFile(values.input, "utf8")) as Record<string, unknown>) : {};
  } catch (e) {
    err(`Lecture de --input impossible: ${(e as Error).message}`);
    return 2;
  }
  if (values.url?.length) raw.startUrls = values.url.map((url) => ({ url }));
  if (values.limit !== undefined) raw.resultsLimit = Number(values.limit);
  if (values.sort) raw.viewOption = values.sort;
  if (values.since) raw.onlyPostsNewerThan = values.since;

  let input;
  try {
    input = parseInput(raw);
  } catch (e) {
    if (e instanceof ZodError) {
      err("Entrée invalide:\n" + e.issues.map((i) => `  ${i.path.join(".") || "(racine)"}: ${i.message}`).join("\n"));
      return 2;
    }
    throw e;
  }
  for (const w of input.warnings) err(`avertissement: ${w}`);

  let factory = deps.sourceFactory;
  let closeBrowser: (() => Promise<void>) | undefined;
  if (!factory) {
    const b = await createBrowserSourceFactory({ proxyUrl: values.proxy });
    factory = b.factory;
    closeBrowser = b.close;
  }

  try {
    const result = await runExtraction(input, {
      sourceFactory: factory,
      concurrency,
      ...(values.resume && { stateDir: values.out }),
      log: (m) => err(m),
    });
    const path = await writeDataset(result.posts, format, values.out);
    out(`${result.posts.length} post(s) -> ${path}`);
    for (const e of result.errors) err(`échec ${e.inputUrl}: ${e.code} - ${e.message}`);
    return result.errors.length ? 1 : 0;
  } finally {
    await closeBrowser?.();
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("/fbgroups")) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    console.error(e);
    process.exit(2);
  });
}
