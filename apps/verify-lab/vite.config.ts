import { defineConfig } from "vite";

// base "./" so the build also works from a Swarm /bzz/<ref>/ URL (docs/20).
export default defineConfig({ base: "./", server: { port: 5181, strictPort: true } });
