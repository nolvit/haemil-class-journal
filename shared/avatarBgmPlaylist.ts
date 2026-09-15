export function orderedPlaylistTracks<T extends { id: string }>(
  tracks: T[],
  order: string[]
) {
  const byId = new Map(tracks.map(track => [track.id, track]));
  const usedIds = new Set<string>();
  const ordered: T[] = [];
  for (const id of order) {
    const track = byId.get(id);
    if (!track || usedIds.has(id)) continue;
    usedIds.add(id);
    ordered.push(track);
  }
  return [...ordered, ...tracks.filter(track => !usedIds.has(track.id))];
}

export function movePlaylistTrack(
  order: string[],
  draggedId: string,
  targetId: string
) {
  const from = order.indexOf(draggedId);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, draggedId);
  return next;
}
