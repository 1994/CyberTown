import { useEffect } from 'react';
import type { RefObject } from 'react';

/** Focus ownership for the legacy drawers; nested confirmation dialogs take priority. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, open: boolean, returnSelector?: string, focusDialog = false) {
  useEffect(() => {
    const root = ref.current;
    if (!open || !root) return;
    const before = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement : null;
    const controls = () => Array.from(root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]',
    )).filter(el => el.getClientRects().length > 0);
    (focusDialog ? root : controls()[0] ?? root).focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs.item(dialogs.length - 1) !== root) return;
      const items = controls();
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (!items.length) { event.preventDefault(); root.focus(); }
      else if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)!.focus(); }
      else if (!event.shiftKey && (index < 0 || index === items.length - 1)) { event.preventDefault(); items[0].focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (before?.isConnected) before.focus();
      else if (returnSelector) document.querySelector<HTMLElement>(returnSelector)?.focus();
    };
  }, [ref, open, returnSelector, focusDialog]);
}
