import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ExtractionError, type ErrorCode } from "./errors.js";
import { extractPost } from "./facebook/extract.js";
import { readFeed, type PostSource } from "./facebook/feed.js";
import type { ParsedInput } from "./input/index.js";
import type { Post } from "./model/index.js";
import { enrichWithOcr, type OcrProvider } from "./ocr.js";

export type Group = ParsedInput["groups"][number];

export interface SourceHandle {
  source: PostSource;
  close?: () => Promise<void>;
}
export type SourceFactory = (group: Group) => Promise<SourceHandle>;

export interface RunOptions {
  sourceFactory: SourceFactory;
  /** Dossier de l'état persistant (IDs vus, curseur). Sans lui : pas de reprise. */
  stateDir?: string;
  concurrency?: number;
  /** Tentatives supplémentaires sur BLOCKED, avec backoff exponentiel. */
  retries?: number;
  backoffMs?: number;
  ocr?: OcrProvider;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

export interface GroupError {
  inputUrl: string;
  code: ErrorCode;
  message: string;
}

export interface RunResult {
  posts: Post[];
  errors: GroupError[];
  warnings: string[];
}

interface GroupState {
  seenIds: string[];
  cursor: string | null;
}
type State = Record<string, GroupState>;

const STATE_FILE = "state.json";

async function loadState(dir: string): Promise<State> {
  try {
    return JSON.parse(await readFile(join(dir, STATE_FILE), "utf8")) as State;
  } catch {
    return {};
  }
}

async function saveState(dir: string, state: State): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, STATE_FILE), JSON.stringify(state));
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function collectGroup(group: Group, input: ParsedInput, opts: RunOptions, state: State): Promise<Post[]> {
  const gs = (state[group.idOrSlug] ??= { seenIds: [], cursor: null });
  const seenIds = new Set(gs.seenIds);
  const handle = await opts.sourceFactory(group);
  try {
    const posts: Post[] = [];
    const feed = readFeed(handle.source, {
      ...(input.resultsLimit !== undefined && { resultsLimit: input.resultsLimit }),
      viewOption: input.viewOption,
      ...(input.newerThan && { newerThan: input.newerThan }),
      seenIds,
      onCursor: (c) => {
        gs.cursor = c;
      },
    });
    for await (const raw of feed) posts.push(extractPost(raw, { inputUrl: group.inputUrl }));
    return posts;
  } finally {
    gs.seenIds = [...seenIds];
    await handle.close?.().catch(() => undefined);
  }
}

/** Exécute l'extraction : une erreur sur un groupe est consignée sans arrêter les autres. */
export async function runExtraction(input: ParsedInput, opts: RunOptions): Promise<RunResult> {
  const sleep = opts.sleep ?? defaultSleep;
  const log = opts.log ?? (() => undefined);
  const state: State = opts.stateDir ? await loadState(opts.stateDir) : {};
  const results = new Map<number, Post[]>();
  const errors: GroupError[] = [];
  let next = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      const group = input.groups[i];
      if (!group) return;
      const attempts = (opts.retries ?? 2) + 1;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          results.set(i, await collectGroup(group, input, opts, state));
          log(`ok ${group.inputUrl}`);
          break;
        } catch (e) {
          const err = e instanceof ExtractionError ? e : new ExtractionError("UNKNOWN", e instanceof Error ? e.message : String(e));
          if (err.code === "BLOCKED" && attempt < attempts) {
            await sleep((opts.backoffMs ?? 2000) * 2 ** (attempt - 1));
            continue;
          }
          log(`erreur ${group.inputUrl}: ${err.code} ${err.message}`);
          errors.push({ inputUrl: group.inputUrl, code: err.code, message: err.message });
          break;
        }
      }
    }
  };

  const n = Math.max(1, Math.min(opts.concurrency ?? 1, input.groups.length));
  await Promise.all(Array.from({ length: n }, worker));

  if (opts.stateDir) await saveState(opts.stateDir, state);
  let posts = input.groups.flatMap((_, i) => results.get(i) ?? []);
  if (opts.ocr) posts = await enrichWithOcr(posts, opts.ocr);
  return { posts, errors, warnings: input.warnings };
}
