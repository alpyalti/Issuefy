/** Keep keyboard navigation inside an open modal and let its owner close it. */
export function trapDialogKey(event: KeyboardEvent, dialog: HTMLElement, close: () => void): void {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== "Tab") return;
  const items = Array.from(dialog.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
  )).filter(el => el.getClientRects().length > 0);
  const first = items[0], last = items[items.length - 1];
  if (!first) { event.preventDefault(); return; }
  const active = dialog.ownerDocument.activeElement;
  if (event.shiftKey ? active === first || !dialog.contains(active) : active === last || !dialog.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}
