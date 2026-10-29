// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { Plugin } from "vite";
import config from "../vite.config.js";

function findPlugin(name: string): Plugin | undefined {
  const plugins = (config.plugins ?? []) as unknown as (Plugin | Plugin[])[];
  return plugins.flat().find((plugin) => plugin?.name === name);
}

/**
 * Reads Vitest's `test.setupFiles` out of the exported config. The `test` key is
 * the Vitest extension to the Vite config and is not part of `UserConfig`, so it
 * is read structurally instead of by narrowing the config's declared type.
 */
function readSetupFiles(): string[] {
  // SAFETY: only the shape of the `test.setupFiles` array is read, and every element is checked to be a string.
  const testOptions = (config as { test?: { setupFiles?: unknown } }).test;
  return Array.isArray(testOptions?.setupFiles)
    ? testOptions.setupFiles.filter((file): file is string => typeof file === "string")
    : [];
}

describe("Vite development server", () => {
  it("listens on the pinned port and refuses to fall through to another one", () => {
    expect(config.server?.port).toBe(1574);
    expect(config.server?.strictPort).toBe(true);
  });
});

describe("Vite development proxy", () => {
  it("forwards API and upload routes to the local server with a changed origin", () => {
    expect(config.server?.proxy).toEqual({
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    });
  });
});

describe("Vite MDX compilation", () => {
  it("runs the MDX plugin before the other transforms", () => {
    const plugin = findPlugin("@mdx-js/rollup");

    expect(plugin).toBeDefined();
    expect(plugin?.enforce).toBe("pre");
  });

  it("compiles a .mdx file against the @mdx-js/react provider source", async () => {
    const plugin = findPlugin("@mdx-js/rollup");
    if (typeof plugin?.transform !== "function") {
      throw new Error("the MDX plugin exposes no transform hook");
    }

    const result = await plugin.transform.call(
      // SAFETY: the MDX transform never touches the rollup plugin context for a source with no imports.
      {} as never,
      "# Title\n\nSome _content_.\n",
      "/tmp/mdx-fixture.mdx",
    );
    const code = typeof result === "string" ? result : (result?.code ?? "");

    expect(code).toContain("@mdx-js/react");
  });
});

describe("Vitest test environment", () => {
  it("registers the jest-dom matchers that tsconfig already advertises", () => {
    expect(readSetupFiles()).toContain("src/test-setup.ts");
  });
});
