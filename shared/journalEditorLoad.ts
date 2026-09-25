/** A cached row can open the editor immediately while its query refreshes. */
export function journalEditorLoadState(
  needsInitialHydration: boolean,
  hasRow: boolean,
  query: { isError: boolean; isSuccess: boolean; isFetching: boolean },
) {
  const loadError = needsInitialHydration && !hasRow &&
    (query.isError || (query.isSuccess && !query.isFetching));
  return {
    loadError,
    isLoadingDate: needsInitialHydration && !hasRow && !loadError,
  };
}
