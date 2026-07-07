import { defineConfig } from "vite";
import type { Server as HttpServer } from "node:http";
import vue from "@vitejs/plugin-vue";
import {
  attachCodexBridgeWebSocketServer,
  createCodexBridgeMiddleware,
} from "./src/server/codexAppServerBridge";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: {
    port: 5173,
  },
  plugins: [
    vue(),
    tailwindcss(),
    {
      name: "codex-bridge",
      configureServer(server) {
        const bridge = createCodexBridgeMiddleware();
        const httpServer = server.httpServer as HttpServer | undefined;
        const disposeWebSocketServer = httpServer
          ? attachCodexBridgeWebSocketServer(httpServer)
          : () => {};
        server.middlewares.use(bridge);
        server.httpServer?.once("close", () => {
          disposeWebSocketServer();
          bridge.dispose();
        });
      },
    },
  ],
});
