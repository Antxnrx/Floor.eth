import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "landing-source",
  base: "./",
  plugins: [tailwindcss(), glsl()],
  build: {
    outDir: "../public/landing",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./landing-source/index.html", import.meta.url)),
        details: fileURLToPath(new URL("./landing-source/details.html", import.meta.url)),
      },
    },
  },
});
