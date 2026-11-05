import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the build works from any path, including a Swarm /bzz/<ref>/ URL (docs/20 §Use 3).
export default defineConfig({ plugins: [react()], base: "./" });
