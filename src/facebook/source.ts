import type { Page, Response } from "playwright";
import { ExtractionError } from "../errors.js";
import type { PostSource, RawPage } from "./feed.js";
import type { FacebookSession } from "./session.js";

/** Convertit le corps d'une réponse GraphQL en page de posts bruts; null si la réponse ne porte pas de posts. */
export type GraphqlParser = (body: string) => RawPage | null;

/** Classe une navigation en erreur explicite (groupe privé/inexistant/bloqué), ou null si la page est exploitable. */
export function classifyNavigation(finalUrl: string, status: number | undefined): ExtractionError | null {
  let path = "";
  try {
    path = new URL(finalUrl).pathname;
  } catch {
    /* URL illisible : on se fie au statut */
  }
  if (/^\/(login|checkpoint)\b/.test(path)) {
    return new ExtractionError("LOGIN_REQUIRED", "Facebook exige une connexion pour ce groupe (privé ou accès anonyme refusé)");
  }
  if (status === 404) return new ExtractionError("NOT_FOUND", "Groupe introuvable");
  if (status === 429 || status === 403) return new ExtractionError("BLOCKED", `Accès bloqué (HTTP ${status})`);
  return null;
}

export interface PlaywrightSourceOptions {
  parser?: GraphqlParser | undefined;
  /** Motif d'URL des réponses à intercepter. */
  graphqlPattern?: RegExp;
  /** Délai max d'attente de nouvelles réponses après un défilement (ms). */
  settleMs?: number;
  /** Délais aléatoires entre défilements [min, max] (ms). */
  jitterMs?: [number, number];
}

/**
 * Source basée sur l'interception des réponses réseau JSON pendant le défilement du flux.
 * Le parseur GraphQL est injecté : le format réel n'est pas observable sans connexion (voir README).
 */
export class PlaywrightSource implements PostSource {
  private page: Page | undefined;
  private queue: RawPage[] = [];
  private scrolls = 0;

  constructor(
    private readonly session: FacebookSession,
    private readonly url: string,
    private readonly opts: PlaywrightSourceOptions = {},
  ) {}

  private async open(): Promise<Page> {
    const page = await this.session.context.newPage();
    this.page = page;
    const pattern = this.opts.graphqlPattern ?? /\/api\/graphql/;
    page.on("response", (r: Response) => {
      if (!pattern.test(r.url()) || !this.opts.parser) return;
      void r
        .text()
        .then((body) => {
          const parsed = this.opts.parser?.(body);
          if (parsed) this.queue.push(parsed);
        })
        .catch(() => undefined);
    });
    const resp = await page.goto(this.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const err = classifyNavigation(page.url(), resp?.status());
    if (err) throw err;
    if (!this.opts.parser) {
      throw new ExtractionError(
        "NOT_IMPLEMENTED",
        "Aucun parseur GraphQL configuré : le format des réponses Facebook n'a pas été observé",
      );
    }
    return page;
  }

  async fetchPage(): Promise<RawPage> {
    const page = this.page ?? (await this.open());
    if (this.scrolls > 0) {
      const [lo, hi] = this.opts.jitterMs ?? [800, 2000];
      await page.waitForTimeout(lo + Math.random() * (hi - lo));
      await page.mouse.wheel(0, 4000);
    }
    this.scrolls++;
    const settle = this.opts.settleMs ?? 4000;
    const deadline = Date.now() + settle;
    while (this.queue.length === 0 && Date.now() < deadline) await page.waitForTimeout(100);
    const posts = this.queue.splice(0).flatMap((p) => p.posts);
    return { posts, nextCursor: posts.length ? `scroll:${this.scrolls}` : null };
  }

  async close(): Promise<void> {
    await this.page?.close().catch(() => undefined);
  }
}
