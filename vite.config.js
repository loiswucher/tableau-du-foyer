import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" : fonctionne à la fois pour Capacitor (APK) et GitHub Pages
export default defineConfig({
  plugins: [react()],
  base: "./",
});
