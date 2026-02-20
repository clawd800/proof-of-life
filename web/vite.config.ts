import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { CONTRACTS } from "./src/shared/addresses";

function injectContracts() {
  return {
    name: 'inject-contracts',
    transformIndexHtml(html: string) {
      return html
        .replace(/__LAS_CONTRACT__/g, CONTRACTS.LAS)
        .replace(/__IDENTITY_CONTRACT__/g, CONTRACTS.IDENTITY);
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), injectContracts()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
    preserveSymlinks: true,
  },
  build: {
    outDir: "dist",
  },
});
