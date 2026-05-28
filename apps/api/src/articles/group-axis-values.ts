/** Group axis_value rows by their parent axis. Used by ArticlesService.listMine
 * to convert a flat list of value UUIDs into per-axis `IN (...)` clauses so the
 * SQL produces AND-across-axes / OR-within-axis semantics. */
export function groupAxisValuesByAxis(
  rows: ReadonlyArray<{ id: string; axisId: string }>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const row of rows) {
    const list = out.get(row.axisId) ?? [];
    if (!list.includes(row.id)) list.push(row.id);
    out.set(row.axisId, list);
  }
  return out;
}
