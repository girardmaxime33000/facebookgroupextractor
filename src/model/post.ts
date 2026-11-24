import { z } from "zod";

/**
 * Schéma de sortie (SPEC.md §4). Source unique de vérité.
 * Écart documenté : `likesCount` est un nombre pour un post et une chaîne pour un commentaire (comme l'original).
 */
export const CommentSchema = z.object({
  commentUrl: z.string(),
  id: z.string(),
  feedbackId: z.string(),
  date: z.string(),
  text: z.string(),
  profileUrl: z.string().optional(),
  profilePicture: z.string().optional(),
  profileId: z.string(),
  profileName: z.string(),
  likesCount: z.string(),
  threadingDepth: z.number().int().min(0),
});

export const PostSchema = z.object({
  facebookUrl: z.string(),
  url: z.string(),
  time: z.string(),
  user: z.object({ id: z.string(), name: z.string() }),
  text: z.string(),
  topReactionsCount: z.number().int().optional(),
  feedbackId: z.string(),
  reactionLikeCount: z.number().int().optional(),
  reactionLoveCount: z.number().int().optional(),
  reactionHahaCount: z.number().int().optional(),
  reactionWowCount: z.number().int().optional(),
  reactionSadCount: z.number().int().optional(),
  reactionAngryCount: z.number().int().optional(),
  reactionCareCount: z.number().int().optional(),
  id: z.string(),
  legacyId: z.string(),
  likesCount: z.number().int(),
  sharesCount: z.number().int(),
  commentsCount: z.number().int(),
  topComments: z.array(CommentSchema),
  facebookId: z.string(),
  groupTitle: z.string(),
  inputUrl: z.string(),
  pageAdLibrary: z.object({ is_business_page_active: z.boolean(), id: z.string() }).optional(),
});

export type Comment = z.infer<typeof CommentSchema>;
export type Post = z.infer<typeof PostSchema>;

export const REACTION_TYPES = ["like", "love", "haha", "wow", "sad", "angry", "care"] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

/**
 * Forme intermédiaire que tout adaptateur de source (GraphQL interceptée, DOM) doit produire.
 * `extract` est la seule couche qui la convertit en `Post`.
 */
export interface RawComment {
  /** Identifiant legacy du commentaire. */
  commentId: string;
  /** Identifiant de nœud (base64), si connu. */
  id?: string;
  feedbackId?: string;
  /** Secondes epoch (UTC). */
  createdAt: number;
  text: string;
  author: { id: string; name: string; url?: string; picture?: string };
  likesCount: number;
  threadingDepth: number;
}

export interface RawPost {
  /** Identifiant de nœud (base64) du post. */
  id: string;
  legacyId: string;
  feedbackId?: string;
  /** Secondes epoch (UTC). */
  createdAt: number;
  author: { id: string; name: string };
  text: string;
  reactions: Partial<Record<ReactionType, number>>;
  topReactionsCount?: number;
  sharesCount: number;
  commentsCount: number;
  comments: RawComment[];
  group: { id: string; title: string; slug: string };
  pageAdLibrary?: { is_business_page_active: boolean; id: string };
}
