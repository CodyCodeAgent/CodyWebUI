import { defineConfig } from "vite";
import type { Server as HttpServer } from "node:http";
import { execFileSync } from "node:child_process";
import vue from "@vitejs/plugin-vue";
import {
  attachCodexBridgeWebSocketServer,
  createCodexBridgeMiddleware,
} from "./src/server/codexAppServerBridge";
import tailwindcss from "@tailwindcss/vite";

function readGitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const buildVersion = process.env.npm_package_version ?? "0.0.0";
const buildGitSha = readGitSha();
const buildTime = new Date().toISOString();

export default defineConfig({
  define: {
    __CODY_VERSION__: JSON.stringify(buildVersion),
    __CODY_GIT_SHA__: JSON.stringify(buildGitSha),
    __CODY_BUILD_TIME__: JSON.stringify(buildTime),
  },
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
