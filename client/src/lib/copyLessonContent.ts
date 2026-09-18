/** Copies the lesson text verbatim; the caller never supplies homework or notes. */
export async function copyLessonContent(content: string): Promise<boolean> {
  if (!content.trim()) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      return true;
    }
  } catch {
    // Older browsers, insecure origins, or permission denial: try the legacy copy command.
  }
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = window.getSelection();
  const previousRanges: Range[] = [];
  if (selection) {
    for (let index = 0; index < selection.rangeCount; index++) previousRanges.push(selection.getRangeAt(index).cloneRange());
  }
  const field = document.createElement("textarea");
  field.value = content;
  field.readOnly = true;
  field.tabIndex = -1;
  field.setAttribute("aria-label", "수업 내용 복사");
  Object.assign(field.style, { position: "fixed", top: "0", left: "-9999px", fontSize: "16px" });
  try {
    document.body.appendChild(field);
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, content.length);
    return typeof document.execCommand === "function" && document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    previousFocus?.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      for (const range of previousRanges) selection.addRange(range);
    }
  }
}
