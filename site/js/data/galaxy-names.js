// Catalogue names and aliases share case, whitespace and zero-padding rules.
export function normalizeGalaxyName(name) {
  return String(name || '').toLowerCase().replace(/\d+/g, n => n.replace(/^0+(?=\d)/, '')).replace(/[^a-z0-9]/g, '');
}

export function matchesGalaxyName(row, query) {
  const q = normalizeGalaxyName(query);
  return !q || [row.name, ...(row.source?.alias || '').split(';')].some(name => normalizeGalaxyName(name).includes(q));
}

export function searchGalaxyNames(rows, query) {
  const q = normalizeGalaxyName(query);
  if (!q) return [];
  return rows.flatMap(row => {
    const names = [row.name, ...(row.source?.alias || '').split(';')].filter(Boolean);
    let best = null;
    for (let i = 0; i < names.length; i++) {
      const name = normalizeGalaxyName(names[i]);
      if (!name.includes(q)) continue;
      const rank = (name === q ? 0 : name.startsWith(q) ? 2 : 4) + (i ? 1 : 0);
      if (!best || rank < best.rank) best = { row, alias: i ? names[i] : null, rank };
    }
    return best ? [best] : [];
  }).sort((a, b) => a.rank - b.rank || a.row.name.localeCompare(b.row.name));
}
