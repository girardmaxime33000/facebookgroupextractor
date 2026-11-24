import type { Post } from "../model/index.js";

export type Row = Record<string, string | number | boolean | null>;

const COLUMNS = [
  "facebookUrl", "url", "time", "user.id", "user.name", "text", "topReactionsCount", "feedbackId",
  "reactionLikeCount", "reactionLoveCount", "reactionHahaCount", "reactionWowCount", "reactionSadCount",
  "reactionAngryCount", "reactionCareCount", "id", "legacyId", "likesCount", "sharesCount", "commentsCount",
  "topComments", "facebookId", "groupTitle", "inputUrl", "pageAdLibrary.is_business_page_active", "pageAdLibrary.id",
] as const;

export const COLUMN_NAMES: readonly string[] = COLUMNS;

/** Aplati un post : objets imbriqués en `a.b`, tableau `topComments` sérialisé en JSON. Colonnes fixes. */
export function flattenPost(post: Post): Row {
  const row: Row = {};
  for (const col of COLUMNS) {
    let v: unknown;
    if (col === "topComments") v = JSON.stringify(post.topComments);
    else if (col.includes(".")) {
      const [a, b] = col.split(".") as [keyof Post, string];
      v = (post[a] as Record<string, unknown> | undefined)?.[b];
    } else v = post[col as keyof Post];
    row[col] = (v ?? null) as Row[string];
  }
  return row;
}
