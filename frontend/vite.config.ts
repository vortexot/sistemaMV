import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const hotReloadDisabled = process.env.DISABLE_HOT_RELOAD === "true";
const apiProxyTarget = process.env.VITE_PROXY_TARGET?.trim() || "http://localhost:8001";

export default defineConfig({
  base: process.env.VITE_BASE_PATH?.trim() || "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@/admin/AdminRoutes",
        replacement: path.resolve(
          __dirname,
          process.env.VITE_STATIC_CATALOG === "true"
            ? "./src/admin/DisabledAdminRoutes.tsx"
            : "./src/admin/AdminRoutes.tsx",
        ),
      },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      { find: /^lucide-react$/, replacement: path.resolve(__dirname, "./src/lib/lucide-react.tsx") },
      { find: "lucide-react-upstream", replacement: path.resolve(__dirname, "./node_modules/lucide-react") },
      { find: /^recharts$/, replacement: path.resolve(__dirname, "./src/lib/recharts.tsx") },
      { find: "recharts-upstream", replacement: path.resolve(__dirname, "./node_modules/recharts") },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 3000,
    allowedHosts: ["localhost"],
    cors: false,
    hmr: hotReloadDisabled ? false : { overlay: true },
    watch: hotReloadDisabled ? null : { usePolling: true, interval: 300 },
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
