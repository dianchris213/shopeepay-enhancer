import { useCallback, useRef } from "react";

/**
 * Adds mouse drag-to-scroll to a horizontally scrollable container.
 * Touch scrolling stays native, so mobile behaviour is unchanged.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const state = useRef({ down: false, startX: 0, startLeft: 0, moved: false });

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
    if (Math.abs(dx) > 3) state.current.moved = true;
    el.scrollLeft = state.current.startLeft - dx;
  }, []);

  /** True when the last pointer interaction was a drag, so clicks can be ignored. */
  const didDrag = useCallback(() => state.current.moved, []);

  return {
    ref,
    didDrag,
    dragProps: {
      onMouseDown,
      onMouseMove,
      onMouseUp: end,
      onMouseLeave: end,
    },
  };
}
