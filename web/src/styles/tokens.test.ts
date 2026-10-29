import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tokens = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");
const editorStyles = readFileSync(resolve(process.cwd(), "src/styles/editor.css"), "utf8");

describe("code block theme tokens", () => {
  it("maps a light surface in light mode and a dark surface in dark mode", () => {
    expect(tokens).toMatch(/--light-code-block-surface:\s*#f7f7f5\s*;/i);
    expect(tokens).toMatch(/--dark-code-block-surface:\s*#202020\s*;/i);
    expect(tokens).toMatch(/:root\s*\{[^}]*--code-block-surface:\s*var\(--light-code-block-surface\)/s);
    expect(tokens).toMatch(/\.dark\s*\{[^}]*--code-block-surface:\s*var\(--dark-code-block-surface\)/s);
    expect(tokens).not.toMatch(/--light-code-block-surface:\s*#1e1e2e/i);
  });

  it("applies the semantic surface token to code blocks", () => {
    expect(editorStyles).toMatch(
      /\.block-editor-content\s+\.ProseMirror\s+pre\s*\{[^}]*background(?:-color)?:\s*var\(--code-block-surface\)/s,
    );
  });
});

type Theme = "light" | "dark" | "system-dark";

/**
 * The three declaration blocks that paint the app: `:root` for light, `.dark` for an explicit dark choice, and the
 * `prefers-color-scheme` block for a system dark preference. A token that only lands in two of them leaves the third
 * theme path wrong, so every assertion below runs against all three.
 */
function declarationBlock(source: string, theme: Theme): string {
  const pattern =
    theme === "light"
      ? /^:root\s*\{([^}]*)\}/m
      : theme === "dark"
        ? /^\.dark\s*\{([^}]*)\}/m
        : /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\.light\):not\(\.atripp\)\s*\{([^}]*)\}/;
  const match = pattern.exec(source);
  if (!match?.[1]) throw new Error(`could not find the ${theme} declaration block in tokens.css`);
  return match[1];
}

/** Resolves a custom property to its literal value, following `var(--x)` hops, preferring the theme's own block. */
function resolveToken(source: string, theme: string, name: string): string {
  const declaration = new RegExp(`(?:^|[\\s;])${name}\\s*:\\s*([^;]+);`);
  const raw = declaration.exec(theme)?.[1]?.trim() ?? declaration.exec(source)?.[1]?.trim();
  if (raw === undefined) throw new Error(`${name} is not declared in tokens.css`);
  const indirect = /^var\(\s*(--[\w-]+)\s*\)$/.exec(raw);
  return indirect ? resolveToken(source, theme, indirect[1]!) : raw;
}

function relativeLuminance(hex: string): number {
  const digits = hex.replace("#", "");
  const expanded = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255);
  const linear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(channels[0]!) + 0.7152 * linear(channels[1]!) + 0.0722 * linear(channels[2]!);
}

describe("graph token ramp", () => {
  // The vendored MDXCN graph components paint their intensity scale with `text-graph-frame`,
  // `text-graph-muted` and `text-graph-accent`. Those utilities only exist if the theme declares
  // the matching `--color-graph-*` values, which `@theme inline` in index.css wires from these.
  const themes: Theme[] = ["light", "dark", "system-dark"];

  it("declares the three graph tokens in every theme path", () => {
    for (const theme of themes) {
      const block = declarationBlock(tokens, theme);
      expect(block, `${theme} --graph-frame`).toMatch(/--graph-frame:\s*var\(--border\)/);
      expect(block, `${theme} --graph-muted`).toMatch(/--graph-muted:\s*var\(--muted-foreground\)/);
    }

    expect(declarationBlock(tokens, "light")).toMatch(/--graph-accent:\s*var\(--light-graph-accent\)/);
    for (const theme of ["dark", "system-dark"] as const) {
      expect(declarationBlock(tokens, theme), `${theme} --graph-accent`).toMatch(
        /--graph-accent:\s*var\(--dark-graph-accent\)/,
      );
    }

    expect(tokens).toMatch(/--light-graph-accent:\s*#111110\s*;/i);
    expect(tokens).toMatch(/--dark-graph-accent:\s*#ffffff\s*;/i);
    // Only `palette="mono"` is used, so the duo and multi accents stay undefined on purpose.
    expect(tokens).not.toMatch(/--graph-accent-[23]/);
  });

  it("keeps an empty cell lighter than a full one in the light theme", () => {
    const theme = declarationBlock(tokens, "light");
    const empty = relativeLuminance(resolveToken(tokens, theme, "--graph-frame"));
    const middle = relativeLuminance(resolveToken(tokens, theme, "--graph-muted"));
    const full = relativeLuminance(resolveToken(tokens, theme, "--graph-accent"));

    expect(empty).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(full);
  });

  it("keeps an empty cell darker than a full one in the dark theme", () => {
    for (const name of ["dark", "system-dark"] as const) {
      const theme = declarationBlock(tokens, name);
      const empty = relativeLuminance(resolveToken(tokens, theme, "--graph-frame"));
      const middle = relativeLuminance(resolveToken(tokens, theme, "--graph-muted"));
      const full = relativeLuminance(resolveToken(tokens, theme, "--graph-accent"));

      expect(empty, `${name} empty vs middle`).toBeLessThan(middle);
      expect(middle, `${name} middle vs full`).toBeLessThan(full);
    }
  });
});

describe("atripp theme tokens", () => {
  // The third theme is one self-contained block: its surface and accents are literals, and its graph ramp keeps
  // the dark-style ordering (frame darker than muted, muted darker than a full cell).
  const block = /^\.atripp\s*\{([^}]*)\}/m.exec(tokens)?.[1];

  it("declares the third theme with its own surface, violet primary and magenta heatmap accent", () => {
    expect(block, "the .atripp block is missing").toBeTruthy();
    expect(block).toMatch(/--code-block-surface:\s*#151222\s*;/);
    expect(block).toMatch(/--primary:\s*#b56af8\s*;/);
    expect(block).toMatch(/--ring:\s*#db7afc\s*;/);
    expect(block).toMatch(/--graph-accent:\s*#fb42db\s*;/);
  });

  it("keeps the dark-style graph ramp ordering", () => {
    expect(block).toBeTruthy();
    const frame = relativeLuminance(resolveToken(tokens, block!, "--graph-frame"));
    const muted = relativeLuminance(resolveToken(tokens, block!, "--graph-muted"));
    const full = relativeLuminance(resolveToken(tokens, block!, "--graph-accent"));

    expect(frame).toBeLessThan(muted);
    expect(muted).toBeLessThan(full);
  });
});
