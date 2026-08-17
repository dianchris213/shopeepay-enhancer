import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDragScroll } from "@/hooks/use-drag-scroll";

/**
 * Horizontal drag-to-scroll mechanics: pressing and moving the mouse scrolls
 * the strip, and a click that followed a drag must not select a card.
 */
function Strip({ onSelect }: { onSelect: () => void }) {
  const strip = useDragScroll<HTMLDivElement>();
  return (
    <div ref={strip.ref} {...strip.dragProps} data-testid="strip">
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
  const strip = screen.getByTestId("strip");
  // jsdom has no layout: scrollLeft is a read-only 0, so back it with a field.
  let scrollLeft = 0;
  Object.defineProperty(strip, "scrollLeft", {
    configurable: true,
    get: () => scrollLeft,
    set: (value: number) => {
      scrollLeft = value;
    },
  });
  return { strip, clicks: () => clicks };
}

describe("drag-to-scroll", () => {
  it("scrolls the strip while the left button is held down", () => {
    const { strip } = setup();
    fireEvent.mouseDown(strip, { button: 0, clientX: 200 });
    fireEvent.mouseMove(strip, { clientX: 140 });
    expect(strip.scrollLeft).toBe(60);
    fireEvent.mouseMove(strip, { clientX: 260 });
    expect(strip.scrollLeft).toBe(-60);
    fireEvent.mouseUp(strip);
  });

  it("ignores movement when no button is held", () => {
    const { strip } = setup();
    fireEvent.mouseMove(strip, { clientX: 40 });
    expect(strip.scrollLeft).toBe(0);
  });

  it("ignores non-primary buttons", () => {
    const { strip } = setup();
    fireEvent.mouseDown(strip, { button: 2, clientX: 200 });
    fireEvent.mouseMove(strip, { clientX: 100 });
    expect(strip.scrollLeft).toBe(0);
  });

  it("stops scrolling after mouseup and after the pointer leaves", () => {
    const { strip } = setup();
    fireEvent.mouseDown(strip, { button: 0, clientX: 200 });
    fireEvent.mouseMove(strip, { clientX: 180 });
    fireEvent.mouseUp(strip);
    fireEvent.mouseMove(strip, { clientX: 50 });
    expect(strip.scrollLeft).toBe(20);

    fireEvent.mouseDown(strip, { button: 0, clientX: 200 });
    fireEvent.mouseLeave(strip);
    fireEvent.mouseMove(strip, { clientX: 50 });
    expect(strip.scrollLeft).toBe(20);
  });

  it("suppresses the click that ends a drag but keeps plain clicks", () => {
    const { strip, clicks } = setup();
    const card = screen.getByRole("button", { name: "Card" });

    // A real drag (>3px) must not trigger the card action.
    fireEvent.mouseDown(strip, { button: 0, clientX: 200 });
    fireEvent.mouseMove(strip, { clientX: 120 });
    fireEvent.mouseUp(strip);
    fireEvent.click(card);
    expect(clicks()).toBe(0);

    // A press without movement still counts as a click.
    fireEvent.mouseDown(strip, { button: 0, clientX: 200 });
    fireEvent.mouseMove(strip, { clientX: 201 });
    fireEvent.mouseUp(strip);
    fireEvent.click(card);
    expect(clicks()).toBe(1);
  });
});
