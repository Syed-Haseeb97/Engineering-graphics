/**
 * Keyboard routing helpers for the drafting canvas.
 * Pure (no DOM constructors) so unit tests can run in Node.
 */
export interface DraftHotkeyTarget {
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
}

export function shouldIgnoreDraftHotkey(target: DraftHotkeyTarget | EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as DraftHotkeyTarget;
  const tag = el.tagName?.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable === true;
}
