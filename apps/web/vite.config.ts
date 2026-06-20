import { createReadStream, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const publicDataRoot = fileURLToPath(new URL("../../public_data", import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: "serve-public-data",
      configureServer(server) {
        server.middlewares.use("/public_data", (request, response, next) => {
          try {
            const relativePath = decodeURIComponent(request.url ?? "").replace(/^\/+/, "");
            const filePath = resolve(publicDataRoot, relativePath);
            if (filePath !== publicDataRoot && !filePath.startsWith(`${publicDataRoot}${sep}`)) return next();
            if (!statSync(filePath).isFile()) return next();
            const extension = extname(filePath);
            response.setHeader("Content-Type", extension === ".json" ? "application/json; charset=utf-8" : "application/octet-stream");
            response.setHeader("Cache-Control", extension === ".f32" ? "public, max-age=31536000, immutable" : "no-cache");
            createReadStream(filePath).pipe(response);
          } catch {
            next();
          }
        });
      },
    },
  ],
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      // 브라우저의 /api 요청을 로컬 FastAPI 서버로 전달한다.
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
