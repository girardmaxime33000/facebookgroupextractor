import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Cookie } from "playwright";

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

/** Parse "http://user:pass@host:port" (ou socks5://). Retourne null si invalide. */
export function parseProxyUrl(raw: string): ProxyConfig | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!["http:", "https:", "socks5:", "socks4:"].includes(u.protocol) || !u.hostname) return null;
  const proxy: ProxyConfig = { server: `${u.protocol}//${u.host}` };
  if (u.username) proxy.username = decodeURIComponent(u.username);
  if (u.password) proxy.password = decodeURIComponent(u.password);
  return proxy;
}

export interface SessionOptions {
  /** URL de proxy; défaut: variable d'environnement PROXY_URL. */
  proxyUrl?: string | undefined;
  headless?: boolean;
  locale?: string;
  userAgent?: string;
  /** Cookies de consentement (sans compte). À déterminer par observation de facebook.com. */
  cookies?: Cookie[];
  /** Chemin d'un binaire Chromium; défaut: celui de Playwright. */
  executablePath?: string | undefined;
}

export function buildContextOptions(opts: SessionOptions = {}, env: NodeJS.ProcessEnv = process.env): BrowserContextOptions {
  const raw = opts.proxyUrl ?? env.PROXY_URL;
  const options: BrowserContextOptions = {
    locale: opts.locale ?? "en-US",
    viewport: { width: 1366, height: 900 },
  };
  if (opts.userAgent) options.userAgent = opts.userAgent;
  if (raw) {
    const proxy = parseProxyUrl(raw);
    if (!proxy) throw new Error("PROXY_URL invalide (attendu: http(s)|socks5://[user:pass@]host:port)");
    options.proxy = proxy;
  }
  return options;
}

export interface FacebookSession {
  browser: Browser;
  context: BrowserContext;
  close(): Promise<void>;
}

/** Ouvre un contexte navigateur anonyme (aucun compte, aucune connexion). */
export async function createSession(opts: SessionOptions = {}): Promise<FacebookSession> {
  const contextOptions = buildContextOptions(opts);
  const executablePath = opts.executablePath ?? process.env.CHROMIUM_PATH;
  const browser = await chromium.launch({
    headless: opts.headless ?? true,
    ...(executablePath && { executablePath }),
  });
  try {
    const context = await browser.newContext(contextOptions);
    if (opts.cookies?.length) await context.addCookies(opts.cookies);
    return {
      browser,
      context,
      close: async () => {
        await context.close();
        await browser.close();
      },
    };
  } catch (e) {
    await browser.close();
    throw e;
  }
}
