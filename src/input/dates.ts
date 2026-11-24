const UNITS = {
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
} as const;

const RELATIVE = /^(\d+)\s*(second|minute|hour|day|week|month|year)s?$/i;
const ABSOLUTE = /^\d{4}(-\d{2}(-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?)?)?$/;

/**
 * Parse une date absolue (YYYY, YYYY-MM, YYYY-MM-DD, ISO complet; UTC par défaut)
 * ou relative ("2 days", "3 months"). Retourne null si invalide.
 */
export function parseNewerThan(input: string, now: Date = new Date()): Date | null {
  const value = input.trim();
  const rel = RELATIVE.exec(value);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2]!.toLowerCase();
    if (unit === "month" || unit === "year") {
      const d = new Date(now);
      if (unit === "month") d.setUTCMonth(d.getUTCMonth() - n);
      else d.setUTCFullYear(d.getUTCFullYear() - n);
      return d;
    }
    return new Date(now.getTime() - n * UNITS[unit as keyof typeof UNITS]);
  }
  if (!ABSOLUTE.test(value)) return null;
  const hasTime = value.includes("T");
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  const normalized = hasTime && !hasZone ? `${value}Z` : value;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}
