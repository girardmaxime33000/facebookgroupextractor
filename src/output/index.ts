import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Post } from "../model/index.js";
import { EXTENSIONS, serialize, type Format } from "./writers.js";

export * from "./flatten.js";
export * from "./writers.js";

/** Écrit le dataset dans `dir/dataset.<ext>` et retourne le chemin. */
export async function writeDataset(posts: Post[], format: Format, dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, `dataset.${EXTENSIONS[format]}`);
  await writeFile(path, await serialize(posts, format));
  return path;
}
