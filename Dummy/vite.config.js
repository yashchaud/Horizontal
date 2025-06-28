// vite.config.js
import { defineConfig, transformWithEsbuild } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    {
      name: "treat-js-files-as-jsx",
      async transform(code, id) {
        if (!id.match(/src\/.*\.js$/)) return null;

        // Use the exposed transform from vite, instead of directly
        // transforming with esbuild
        return transformWithEsbuild(code, id, {
          loader: "jsx",
          jsx: "automatic",
        });
      },
    },
    react(),
  ],
  build: {
    /** If you set esmExternals to true, this plugins assumes that 
      all external dependencies are ES modules */

    commonjsOptions: {
      esmExternals: true,
    },
  },
  optimizeDeps: {
    force: true,
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
  },
  resolve: {
    alias: {
      // Define your aliases here
      "@src": path.resolve(__dirname, "src"),
      "@Pages": path.resolve(__dirname, "src/Pages"),
      "@images": path.resolve(__dirname, "src/components/images"),
      "@Redux": path.resolve(__dirname, "src/Redux"),
      "@components": path.resolve(__dirname, "src/components"),
      "@ui": path.resolve(__dirname, "./@components/ui"),
      "@": path.resolve(__dirname, "./src"),

      // Add more aliases as needed
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
