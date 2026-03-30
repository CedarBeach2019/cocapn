import { defineConfig } from "vitest/config";
import { resolve } from "path";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "@cocapn/protocols/mcp": resolve(__dirname, "../protocols/src/mcp/index.ts"),
      "@cocapn/protocols/a2a": resolve(__dirname, "../protocols/src/a2a/index.ts"),
      "@cocapn/protocols": resolve(__dirname, "../protocols/src/index.ts"),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
