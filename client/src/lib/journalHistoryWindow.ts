/** Open synchronously in the click handler, never after an API request. */
export function openJournalHistoryWindow(href: string): boolean {
  // Only the application's own history page can be opened here.
  const url = new URL(href, window.location.origin);
  if (url.origin !== window.location.origin || url.pathname !== "/journal/history") return false;
  const width = Math.max(360, Math.min(1520, window.screen.availWidth - 40));
  const height = Math.max(480, Math.min(1000, window.screen.availHeight - 80));
  let child: Window | null = null;
  try {
    // Opening about:blank lets us sever opener BEFORE any page code runs.
    // Passing noopener to open() would return null even on success, preventing reliable fallback.
    child = window.open("", "_blank", `popup=yes,width=${width},height=${height},resizable=yes,scrollbars=yes`);
    if (!child) return false; // Leave the real anchor's default new-tab action intact.
    child.opener = null;
    child.location.replace(url.href);
    return true;
  } catch {
    try { child?.close(); } catch { /* The browser owns blocked windows. */ }
    return false;
  }
}
