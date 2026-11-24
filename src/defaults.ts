import { PlaywrightSource, type GraphqlParser } from "./facebook/source.js";
import { createSession, type SessionOptions } from "./facebook/session.js";
import type { SourceFactory } from "./run.js";

/**
 * Fabrique de sources réelle : un navigateur anonyme partagé, une page par groupe.
 * `parser` est le parseur GraphQL (non fourni : format Facebook non observé).
 */
export async function createBrowserSourceFactory(
  opts: SessionOptions & { parser?: GraphqlParser | undefined } = {},
): Promise<{ factory: SourceFactory; close: () => Promise<void> }> {
  const session = await createSession(opts);
  const factory: SourceFactory = async (group) => {
    const source = new PlaywrightSource(session, group.url, { parser: opts.parser });
    return { source, close: () => source.close() };
  };
  return { factory, close: () => session.close() };
}
