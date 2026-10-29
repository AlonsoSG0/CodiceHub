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

const config: ViteConfigWithVitest = {
  // SAFETY: the three plugin options are cast above for the duplicate-Vite-peer-type reason stated there.
  plugins: [mdxPlugin, reactPlugin, tailwindPlugin],
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
