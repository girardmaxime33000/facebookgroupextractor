import type { RawPost } from "../model/index.js";

export interface RawPage {
  posts: RawPost[];
  /** Curseur de la page suivante; absent ou null = fin du flux. */
  nextCursor?: string | null;
}

/** Contrat d'un adaptateur de source (GraphQL interceptée, DOM, fixtures). */
export interface PostSource {
  fetchPage(cursor?: string): Promise<RawPage>;
}

export type ViewOption = "CHRONOLOGICAL" | "RECENT_ACTIVITY" | "TOP_POSTS" | "CHRONOLOGICAL_LISTINGS";

export interface FeedOptions {
  resultsLimit?: number;
  viewOption?: ViewOption;
  /** Appliqué uniquement en CHRONOLOGICAL. */
  newerThan?: Date;
  /** IDs déjà vus (reprise / dédoublonnage); mis à jour pendant la lecture. */
  seenIds?: Set<string>;
  /** Curseur de reprise. */
  startCursor?: string;
  /** Appelé après chaque page avec le curseur suivant (persistance de l'état). */
  onCursor?: (cursor: string | null) => void;
  /** Garde-fou contre les flux infinis. */
  maxPages?: number;
}

/**
 * Lit le flux page par page. S'arrête quand : limite atteinte, post plus ancien que `newerThan`
 * (tri chronologique), fin du flux, curseur répété, page vide ou `maxPages` atteint.
 */
export async function* readFeed(source: PostSource, opts: FeedOptions = {}): AsyncGenerator<RawPost> {
  const view = opts.viewOption ?? "CHRONOLOGICAL";
  const cutoff = view === "CHRONOLOGICAL" ? opts.newerThan?.getTime() : undefined;
  const seen = opts.seenIds ?? new Set<string>();
  const maxPages = opts.maxPages ?? 10_000;
  const visitedCursors = new Set<string>();
  let emitted = 0;
  let cursor = opts.startCursor;

  for (let page = 0; page < maxPages; page++) {
    const { posts, nextCursor } = await source.fetchPage(cursor);
    for (const post of posts) {
      if (cutoff !== undefined && post.createdAt * 1000 < cutoff) return;
      if (seen.has(post.legacyId)) continue;
      seen.add(post.legacyId);
      yield post;
      if (opts.resultsLimit !== undefined && ++emitted >= opts.resultsLimit) return;
    }
    opts.onCursor?.(nextCursor ?? null);
    if (!nextCursor || posts.length === 0 || visitedCursors.has(nextCursor)) return;
    visitedCursors.add(nextCursor);
    cursor = nextCursor;
  }
}
