/** Resolve a whole journal shift against the original sidecar rows, not rows already overwritten. */
export function relocatedMathJournalPayloads(
  original: Array<{ journalId: number; payload: string }>,
  moves: Array<{ sourceId: number; targetId: number }>
) {
  const sourcePayloads = new Map(original.map(row => [row.journalId, row.payload]));
  const targets = new Map<number, string>();
  for (const { sourceId, targetId } of moves) {
    const payload = sourcePayloads.get(sourceId);
    if (payload === undefined) targets.delete(targetId);
    else targets.set(targetId, payload);
  }
  return Array.from(targets, ([journalId, payload]) => ({ journalId, payload }));
}
