import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlurFade } from "@/components/magicui/blur-fade";
import { DotPattern } from "@/components/magicui/dot-pattern";
import { Marquee } from "@/components/magicui/marquee";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { Dock, DockIcon } from "@/components/magicui/dock";

globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
} as unknown as typeof IntersectionObserver;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Magic UI primitives", () => {
  it("renders BlurFade children with props", () => {
    render(<BlurFade data-testid="blur-fade" className="custom-fade" inView>Fade content</BlurFade>);

    expect(screen.getByTestId("blur-fade").textContent).toBe("Fade content");
    expect(screen.getByTestId("blur-fade").className).toContain("custom-fade");
  });

  it("renders NumberTicker value", () => {
    render(<NumberTicker value={42} startValue={42} data-testid="number-ticker" />);

    expect(screen.getByTestId("number-ticker").textContent).toBe("42");
  });

  it("renders Marquee children with props", () => {
    render(<Marquee data-testid="marquee" repeat={1} reverse>Scrolling content</Marquee>);

    expect(screen.getByTestId("marquee").textContent).toBe("Scrolling content");
    expect(screen.getByText("Scrolling content").className).toContain("[animation-direction:reverse]");
  });

  it("renders DotPattern without crashing", () => {
    const { container } = render(<DotPattern data-testid="dot-pattern" width={8} height={8} />);

    expect(container.querySelector("svg[data-testid='dot-pattern']")).not.toBeNull();
  });

  it("renders the Dock and its DockIcon child through the public interface", () => {
    render(
      <Dock aria-label="Example dock">
        <DockIcon aria-label="Example item">Dock item</DockIcon>
      </Dock>,
    );

    expect(screen.getByLabelText("Example dock")).toContainElement(screen.getByLabelText("Example item"));
    expect(screen.getByLabelText("Example item").textContent).toBe("Dock item");
  });

  it("keeps dock magnification enabled when reduced motion is not preferred", async () => {
    const reducedMotion = false;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)" && reducedMotion,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));

    render(<Dock aria-label="Motion preference dock"><DockIcon aria-label="Motion preference item">Item</DockIcon></Dock>);
    const dock = screen.getByLabelText("Motion preference dock");
    const icon = screen.getByLabelText("Motion preference item");
    vi.spyOn(icon, "getBoundingClientRect").mockReturnValue({
      x: 100, y: 0, width: 40, height: 40, top: 0, right: 140, bottom: 40, left: 100,
      toJSON: () => ({}),
    });

    fireEvent.mouseMove(dock, { pageX: 120 });

    await waitFor(() => expect(Number.parseFloat(icon.style.width)).toBeGreaterThan(40));
  });
});
