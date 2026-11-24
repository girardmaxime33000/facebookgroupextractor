import { REACTION_TYPES, type Comment, type Post, type RawComment, type RawPost, type ReactionType } from "../model/index.js";

export interface ExtractContext {
  /** URL fournie en entrée, recopiée dans `inputUrl`. */
  inputUrl: string;
}

const b64 = (s: string): string => Buffer.from(s, "utf8").toString("base64");

export const encodeFeedbackId = (legacyId: string): string => b64(`feedback:${legacyId}`);
export const encodeCommentId = (postLegacyId: string, commentId: string): string =>
  b64(`comment:${postLegacyId}_${commentId}`);

const toIso = (epochSeconds: number): string => new Date(epochSeconds * 1000).toISOString();

const REACTION_FIELD: Record<ReactionType, `reaction${Capitalize<ReactionType>}Count`> = {
  like: "reactionLikeCount",
  love: "reactionLoveCount",
  haha: "reactionHahaCount",
  wow: "reactionWowCount",
  sad: "reactionSadCount",
  angry: "reactionAngryCount",
  care: "reactionCareCount",
};

export function extractComment(raw: RawComment, post: { legacyId: string; url: string }): Comment {
  const comment: Comment = {
    commentUrl: `${post.url}?comment_id=${raw.commentId}`,
    id: raw.id ?? encodeCommentId(post.legacyId, raw.commentId),
    feedbackId: raw.feedbackId ?? b64(`feedback:${raw.commentId}`),
    date: toIso(raw.createdAt),
    text: raw.text,
    profileId: raw.author.id,
    profileName: raw.author.name,
    likesCount: String(raw.likesCount),
    threadingDepth: raw.threadingDepth,
  };
  if (raw.author.url) comment.profileUrl = raw.author.url;
  if (raw.author.picture) comment.profilePicture = raw.author.picture;
  return comment;
}

/** Convertit un `RawPost` en `Post` (SPEC.md §4). Seule couche qui interprète le modèle brut. */
export function extractPost(raw: RawPost, ctx: ExtractContext): Post {
  const facebookUrl = `https://www.facebook.com/groups/${raw.group.slug}`;
  const url = `${facebookUrl}/permalink/${raw.legacyId}/`;

  const reactionFields: Partial<Post> = {};
  let total = 0;
  for (const type of REACTION_TYPES) {
    const n = raw.reactions[type] ?? 0;
    total += n;
    if (n > 0) (reactionFields as Record<string, number>)[REACTION_FIELD[type]] = n;
  }

  const post: Post = {
    facebookUrl,
    url,
    time: toIso(raw.createdAt),
    user: { id: raw.author.id, name: raw.author.name },
    text: raw.text,
    feedbackId: raw.feedbackId ?? encodeFeedbackId(raw.legacyId),
    ...reactionFields,
    id: raw.id,
    legacyId: raw.legacyId,
    likesCount: total,
    sharesCount: raw.sharesCount,
    commentsCount: raw.commentsCount,
    topComments: raw.comments.map((c) => extractComment(c, { legacyId: raw.legacyId, url })),
    facebookId: raw.group.id,
    groupTitle: raw.group.title,
    inputUrl: ctx.inputUrl,
  };
  if (raw.topReactionsCount !== undefined) post.topReactionsCount = raw.topReactionsCount;
  if (raw.pageAdLibrary) post.pageAdLibrary = raw.pageAdLibrary;
  return post;
}
