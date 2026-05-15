import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    css: false,
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost:3000"
      }
    },
    pool: "threads",
    setupFiles: ["./src/test/setup.ts"]
  }
});
