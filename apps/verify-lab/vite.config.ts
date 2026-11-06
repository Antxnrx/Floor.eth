import { defineConfig } from "vite";
import { resolve } from "node:path";

// base "./" so the build also works from a Swarm /bzz/<ref>/ URL (docs/20). Two pages: the verifier and the dataset.
export default defineConfig({
  base: "./",
  server: { port: 5181, strictPort: true },
  build: { rollupOptions: { input: { verify: resolve(__dirname, "index.html"), dataset: resolve(__dirname, "dataset.html") } } },
});
