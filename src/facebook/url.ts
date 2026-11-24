const HOSTS = new Set(["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com"]);

/** Retourne l'identifiant (numérique ou slug) d'un groupe, ou null si l'URL n'est pas une URL de groupe. */
export function parseGroupUrl(raw: string): { idOrSlug: string; url: string } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!HOSTS.has(u.hostname.toLowerCase())) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0] !== "groups" || !parts[1]) return null;
  const idOrSlug = decodeURIComponent(parts[1]);
  if (!/^[\w.-]+$/.test(idOrSlug)) return null;
  return { idOrSlug, url: `https://www.facebook.com/groups/${idOrSlug}` };
}
