// On iOS 27 (seen in WKWebView), the click for the first tap after a page load
// can be held back until the *next* touch starts: the player taps a button,
// nothing happens, and the click later lands wherever the next touch is.
//
// So on iOS buttons don't rely on WebKit's synthesized click: when a clean tap
// ends on one, we cancel the synthetic click and click it right away. This runs
// inside the touch, so it still counts as a user gesture (sharing, clipboard and
// audio are allowed). Text fields are left to WebKit: focusing them from script
// would stop iOS from opening the keyboard.

const BUTTONS = 'button, [role="button"], a[href], summary';
const SLOP = 10; // px a finger may wander and still count as a tap

export function installTapRescue() {
  let start: { x: number; y: number; target: Element } | null = null;

  window.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      start = t && e.touches.length === 1 && e.target instanceof Element ? { x: t.clientX, y: t.clientY, target: e.target } : null;
    },
    { capture: true, passive: true },
  );
  window.addEventListener('touchcancel', () => (start = null), { capture: true, passive: true });

  window.addEventListener(
    'touchend',
    (e) => {
      const s = start;
      start = null;
      const t = e.changedTouches[0];
      if (!s || !t || e.touches.length || Math.hypot(t.clientX - s.x, t.clientY - s.y) > SLOP) return;
      const button = s.target.closest(BUTTONS) as HTMLElement | null;
      if (!button || (button as HTMLButtonElement).disabled) return;
      e.preventDefault(); // no synthetic click from WebKit…
      button.click(); // …we deliver it now
    },
    { capture: true, passive: false },
  );
}
