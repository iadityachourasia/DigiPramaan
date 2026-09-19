import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
    server: {
      // Forces next-intl's ESM build through Vite's own resolver (where the
      // "next/server" alias above applies) instead of Vitest's default
      // externalized-dependency path, which doesn't see aliases the same way.
      deps: { inline: [/next-intl/] },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      // next-intl's own ESM build imports the bare "next/server" specifier
      // with no file extension; Vite's resolver (unlike Node/webpack) can't
      // follow that without an explicit alias to the real file.
      "next/server": path.resolve(process.cwd(), "node_modules/next/server.js"),
    },
  },
});
