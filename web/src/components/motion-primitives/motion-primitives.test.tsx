import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedNumber } from "./animated-number";
import { InView } from "./in-view";
import { ProgressiveBlur } from "./progressive-blur";

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];

  disconnect() {}
  observe() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve() {}
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("motion primitives", () => {
  it("renders ProgressiveBlur with its public props", () => {
    const { container } = render(
      <ProgressiveBlur
        aria-label="Soft edge"
        blurLayers={3}
        className="custom-blur"
        direction="top"
      />,
    );

    expect(container.firstElementChild?.classList.contains("custom-blur")).toBe(true);
    expect(container.querySelectorAll("[aria-label='Soft edge']")).toHaveLength(3);
  });

  it("renders InView with its public props", () => {
    render(
      <InView as="section" variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}>
        Visible content
      </InView>,
    );

    expect(screen.getByText("Visible content").tagName).toBe("SECTION");
  });

  it("renders AnimatedNumber with its public props", () => {
    render(<AnimatedNumber value={42} className="total" />);

    const number = screen.getByText("42");
    expect(number.classList.contains("total")).toBe(true);
  });
});
