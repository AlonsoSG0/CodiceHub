import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@mdx-js/rollup";
import { defineConfig, type PluginOption, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";

type ViteConfigWithVitest = UserConfig & {
  test: {
    environment: "jsdom";
    include: string[];
    setupFiles: string[];
  };
};

// SAFETY: pnpm resolves plugins against duplicate same-version Vite peer types; this runtime plugin targets the Vite API of the app build.
const mdxPlugin = {
  enforce: "pre",
  ...mdx({ providerImportSource: "@mdx-js/react" }),
} as unknown as PluginOption;

// SAFETY: same duplicate-Vite-peer-type cast as mdxPlugin above.
const reactPlugin = react() as unknown as PluginOption;

// SAFETY: same duplicate-Vite-peer-type cast as mdxPlugin above.
const tailwindPlugin = tailwindcss() as unknown as PluginOption;

// One number for the product: the root package.json is the single source, and the CLI binary reads the same field.
// A missing or malformed manifest must fail the build loudly rather than ship a versionless app.
function readVersion(): string {
  let manifest: { version?: unknown };
  try {
    manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: unknown };
  } catch (cause) {
    throw new Error("Could not read the workspace version from package.json", { cause });
  }
  if (typeof manifest.version !== "string" || manifest.version === "") {
    throw new Error("The workspace package.json has no version field");
  }
  return manifest.version;
}

const version = readVersion();

const config: ViteConfigWithVitest = {
  // SAFETY: the three plugin options are cast above for the duplicate-Vite-peer-type reason stated there.
  plugins: [mdxPlugin, reactPlugin, tailwindPlugin],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // Pinned so the documented URL cannot drift: without `strictPort` Vite
    // silently moves to the next free port and the README starts lying.
    port: 1574,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test-setup.ts"],
  },
};

export default defineConfig(config);
