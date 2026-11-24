import { z } from "zod";
import { parseNewerThan } from "./dates.js";
import { parseGroupUrl } from "../facebook/url.js";

export const VIEW_OPTIONS = [
  "CHRONOLOGICAL",
  "RECENT_ACTIVITY",
  "TOP_POSTS",
  "CHRONOLOGICAL_LISTINGS",
] as const;

export const InputSchema = z.object({
  startUrls: z
    .array(
      z.object({
        url: z.string().refine((u) => parseGroupUrl(u) !== null, {
          message: "URL de groupe Facebook invalide (attendu: facebook.com/groups/<id|slug>)",
        }),
      }),
    )
    .min(1, "startUrls ne peut pas être vide"),
  resultsLimit: z.number().int().min(1).optional(),
  viewOption: z.enum(VIEW_OPTIONS).default("CHRONOLOGICAL"),
  onlyPostsNewerThan: z
    .string()
    .refine((s) => parseNewerThan(s) !== null, {
      message: "Date invalide (YYYY-MM-DD, ISO, ou relative: '2 days')",
    })
    .optional(),
});

export type RawInput = z.input<typeof InputSchema>;

export interface ParsedInput {
  groups: { inputUrl: string; idOrSlug: string; url: string }[];
  resultsLimit?: number;
  viewOption: (typeof VIEW_OPTIONS)[number];
  newerThan?: Date;
  warnings: string[];
}

/** Valide l'entrée et retourne un modèle normalisé. Lève ZodError si invalide. */
export function parseInput(raw: unknown, now: Date = new Date()): ParsedInput {
  const input = InputSchema.parse(raw);
  const warnings: string[] = [];
  let newerThan: Date | undefined;
  if (input.onlyPostsNewerThan !== undefined) {
    if (input.viewOption === "CHRONOLOGICAL") {
      newerThan = parseNewerThan(input.onlyPostsNewerThan, now) ?? undefined;
    } else {
      warnings.push(
        `onlyPostsNewerThan ignoré: applicable uniquement avec viewOption=CHRONOLOGICAL (reçu: ${input.viewOption})`,
      );
    }
  }
  const groups = input.startUrls.map(({ url }) => {
    const g = parseGroupUrl(url)!;
    return { inputUrl: url, ...g };
  });
  return {
    groups,
    ...(input.resultsLimit !== undefined && { resultsLimit: input.resultsLimit }),
    viewOption: input.viewOption,
    ...(newerThan && { newerThan }),
    warnings,
  };
}
