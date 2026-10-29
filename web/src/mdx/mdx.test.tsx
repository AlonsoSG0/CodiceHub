import { MDXProvider } from "@mdx-js/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Fixture from "./fixture.mdx";
import { mdxComponents } from "./mdx-components";

globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

describe("MDX provider components", () => {
  it("resolves Callout from the shared provider map", () => {
    render(
      <MDXProvider components={mdxComponents}>
        <Fixture />
      </MDXProvider>,
    );

    expect(screen.getByRole("note").textContent).toContain(
      "Provider content from MDX.",
    );
  });
});
