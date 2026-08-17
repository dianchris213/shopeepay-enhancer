import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDragScroll } from "@/hooks/use-drag-scroll";

/**
 * Touch behaviour of the wallet strip: native horizontal scrolling handles the
 * movement (jsdom has no layout, so the browser's own scroll is not simulated
 * here); the hook's job on touch is to tell a swipe apart from a tap so a
 * swipe never selects the card underneath the finger.
 */
function Strip({ onSelect }: { onSelect: () => void }) {
  const strip = useDragScroll<HTMLDivElement>();
  return (
    <div
      ref={strip.ref}
      {...strip.dragProps}
      data-testid="strip"
      className="overflow-x-auto"
      style={{ touchAction: "pan-x" }}
    >
      <button
        onClick={() => {
          if (strip.didDrag()) return;
          onSelect();
        }}
      >
        Card
      </button>
    </div>
  );
}

function setup() {
  let clicks = 0;
  render(<Strip onSelect={() => (clicks += 1)} />);
  return {
    strip: screen.getByTestId("strip"),
    card: screen.getByRole("button", { name: "Card" }),
    clicks: () => clicks,
  };
}

const touch = (x: number, y = 0) => ({ touches: [{ clientX: x, clientY: y }] });

describe("wallet strip touch swipe", () => {
  it("keeps native scrolling enabled with pan-x touch action", () => {
    const { strip } = setup();
    expect(strip.style.touchAction).toBe("pan-x");
    expect(strip.className).toContain("overflow-x-auto");
  });

  it("treats a tap as a selection", () => {
    const { strip, card, clicks } = setup();
    fireEvent.touchStart(strip, touch(120));
    fireEvent.touchEnd(strip, { changedTouches: [{ clientX: 121, clientY: 0 }] });
    fireEvent.click(card);
    expect(clicks()).toBe(1);
  });

  it("ignores jitter below the swipe threshold", () => {
    const { strip, card, clicks } = setup();
    fireEvent.touchStart(strip, touch(120));
    fireEvent.touchMove(strip, touch(125));
    fireEvent.touchEnd(strip, { changedTouches: [{ clientX: 125, clientY: 0 }] });
    fireEvent.click(card);
    expect(clicks()).toBe(1);
  });

  it("suppresses the click that ends a horizontal swipe", () => {
    const { strip, card, clicks } = setup();
    fireEvent.touchStart(strip, touch(200));
    fireEvent.touchMove(strip, touch(160));
    fireEvent.touchMove(strip, touch(90));
    fireEvent.touchEnd(strip, { changedTouches: [{ clientX: 90, clientY: 0 }] });
    fireEvent.click(card);
    expect(clicks()).toBe(0);
  });

  it("does not suppress the click on a mostly vertical drag", () => {
    const { strip, card, clicks } = setup();
    fireEvent.touchStart(strip, touch(200, 100));
    fireEvent.touchMove(strip, { touches: [{ clientX: 190, clientY: 220 }] });
    fireEvent.touchEnd(strip, { changedTouches: [{ clientX: 190, clientY: 220 }] });
    fireEvent.click(card);
    expect(clicks()).toBe(1);
  });

  it("resets the swipe flag on the next touch", () => {
    const { strip, card, clicks } = setup();
    fireEvent.touchStart(strip, touch(200));
    fireEvent.touchMove(strip, touch(100));
    fireEvent.touchEnd(strip, { changedTouches: [{ clientX: 100, clientY: 0 }] });
    fireEvent.click(card);
    expect(clicks()).toBe(0);

    fireEvent.touchStart(strip, touch(100));
    fireEvent.touchEnd(strip, { changedTouches: [{ clientX: 100, clientY: 0 }] });
    fireEvent.click(card);
    expect(clicks()).toBe(1);
  });

  it("clears the gesture when the touch is cancelled", () => {
    const { strip, card, clicks } = setup();
    fireEvent.touchStart(strip, touch(200));
    fireEvent.touchMove(strip, touch(100));
    fireEvent.touchCancel(strip);
    fireEvent.click(card);
    expect(clicks()).toBe(1);
  });
});
