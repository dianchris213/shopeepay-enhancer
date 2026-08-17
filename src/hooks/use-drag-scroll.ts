import { useCallback, useRef } from "react";

/** Horizontal movement (px) that turns a press/touch into a "drag". */
const DRAG_THRESHOLD = 3;
/** Touch needs a slightly larger threshold: fingers are never perfectly still. */
const SWIPE_THRESHOLD = 8;

/**
 * Adds mouse drag-to-scroll to a horizontally scrollable container and tracks
 * touch swipes.
 *
 * Touch scrolling stays fully native (no `preventDefault`, no manual
 * `scrollLeft` writes) so momentum, scroll-snap and rubber-banding behave
 * exactly like the platform expects. The touch handlers only observe the
 * gesture so a swipe that ends on top of a card does not fire that card's
 * click action.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const state = useRef({ down: false, startX: 0, startLeft: 0, moved: false });
  const touch = useRef({ active: false, startX: 0, startY: 0, moved: false });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || e.button !== 0) return;
    state.current = { down: true, startX: e.pageX, startLeft: el.scrollLeft, moved: false };
  }, []);

  const end = useCallback(() => {
    state.current.down = false;
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || !state.current.down) return;
    const dx = e.pageX - state.current.startX;
    if (Math.abs(dx) > DRAG_THRESHOLD) state.current.moved = true;
    el.scrollLeft = state.current.startLeft - dx;
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const point = e.touches[0];
    if (!point) return;
    touch.current = { active: true, startX: point.clientX, startY: point.clientY, moved: false };
    // A fresh gesture must not inherit the previous one's "was a drag" flag.
    state.current.moved = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touch.current.active) return;
    const point = e.touches[0];
    if (!point) return;
    const dx = point.clientX - touch.current.startX;
    const dy = point.clientY - touch.current.startY;
    // Horizontal-dominant movement only: a vertical page scroll that starts on
    // the strip must still let the card underneath be tapped.
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) touch.current.moved = true;
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!touch.current.active) return;
    touch.current.active = false;
    // Keep `moved` until the next gesture so the synthetic click that follows
    // the swipe can be suppressed by `didDrag()`.
  }, []);

  const onTouchCancel = useCallback(() => {
    touch.current = { active: false, startX: 0, startY: 0, moved: false };
  }, []);

  /** True when the last pointer interaction was a drag/swipe, so clicks can be ignored. */
  const didDrag = useCallback(() => state.current.moved || touch.current.moved, []);

  return {
    ref,
    didDrag,
    dragProps: {
      onMouseDown,
      onMouseMove,
      onMouseUp: end,
      onMouseLeave: end,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel,
    },
  };
}
