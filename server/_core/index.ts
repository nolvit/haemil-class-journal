import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { seedLocalUploads } from "../storage";
import { settlePreviousWeekCounts } from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  await seedLocalUploads();
  void settlePreviousWeekCounts().catch(error => console.error("주간 수업 횟수 자동 누적 확인 실패", error));
  const weeklySettlementTimer = setInterval(() => {
    void settlePreviousWeekCounts().catch(error => console.error("주간 수업 횟수 자동 누적 확인 실패", error));
  }, 60 * 60 * 1000);
  weeklySettlementTimer.unref();
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/pwa/parent.webmanifest", (req, res) => {
    const token =
      typeof req.query.token === "string" &&
      /^[A-Za-z0-9_-]{8,64}$/.test(req.query.token)
        ? req.query.token
        : "";
    res.type("application/manifest+json").send({
      id: "/p/",
      name: "해밀학원 보호자 알림",
      short_name: "해밀 보호자",
      description: "자녀의 수업일지와 등하원 알림",
      start_url: token ? `/p/${token}` : "/p/",
      scope: "/p/",
      display: "standalone",
      background_color: "#FCFBF7",
      theme_color: "#315B57",
      icons: [
        {
          src: "/icons/haemil-logo-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icons/haemil-logo-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
      ],
    });
  });
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
