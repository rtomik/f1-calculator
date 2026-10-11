// Official team colours keyed by Jolpica constructorId. Unknown teams fall back to a fixed palette.
export const TEAM_COLORS: Record<string, string> = {
  mercedes: '#27F4D2',
  ferrari: '#E8002D',
  red_bull: '#3671C6',
  mclaren: '#FF8000',
  aston_martin: '#229971',
  alpine: '#0093CC',
  williams: '#64C4FF',
  rb: '#6692FF',
  sauber: '#52E252',
  kick_sauber: '#52E252',
  audi: '#BB0A30',
  haas: '#B6BABD',
  cadillac: '#C9A86A',
};

export const FALLBACK_PALETTE = ['#a855f7', '#ec4899', '#14b8a6', '#eab308', '#6366f1', '#f97316', '#84cc16', '#06b6d4'];

export function teamColor(teamId: string): string {
  // Hash the id so an unknown team keeps the same fallback colour in every view.
  const hash = [...teamId].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0);
  return TEAM_COLORS[teamId] ?? FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length] ?? '#888888';
}

/** Mixes a hex colour with grey so a team's second driver is distinguishable from the first. */
function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c * 0.55 + 0x80 * 0.45);
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, '0')).join('')}`;
}

/** One colour per competitor: team colour, shaded for the second car of the same team. */
export function seriesColors(items: { id: string; teamId: string }[]): Record<string, string> {
  const seen = new Map<string, number>();
  const out: Record<string, string> = {};
  items.forEach((it) => {
    const count = seen.get(it.teamId) ?? 0;
    seen.set(it.teamId, count + 1);
    const base = teamColor(it.teamId);
    out[it.id] = count === 0 ? base : shade(base);
  });
  return out;
}
