import "dotenv/config";
import {
  initializeMathProgressBaselines,
  applyRequestedMathProgressCorrections,
} from "../mathProgressStore";
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
import {
  ensureRemainingCountNotificationSchema,
  settlePreviousWeekCounts,
  applyWeeklyAutoUnregisteredDays,
} from "../db";
import { dispatchRemainingOneNotifications } from "../remainingCountNotifications";
import {
  ensureRewardSchema,
  settleRewardAttendance,
} from "../avatarRewardStore";
import { registerAttendanceLiveUpdates } from "../attendanceLiveUpdates";

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

async function initializeMathProgress() {
  // Math progress maintenance is not required for the web process to become healthy.
  // Keep validation strict, but never let a one-time correction prevent the server
  // from binding to Railway's PORT.
  try {
    console.info(
      "수학 과정 지정 기준 정정",
      await applyRequestedMathProgressCorrections()
    );
  } catch (error) {
    console.error("수학 과정 지정 기준 정정 실패", error);
  }

  try {
    const courseInitialization = await initializeMathProgressBaselines();
    console.info("수학 과정 초기 반영", courseInitialization);
  } catch (error) {
    console.error("수학 과정 초기 반영 실패", error);
  }
}

async function startServer() {
  await seedLocalUploads();
  await ensureRemainingCountNotificationSchema();
  await ensureRewardSchema();
  let rewardSettlementRunning = false;
  const settleRewards = async () => {
    if (rewardSettlementRunning) return;
    rewardSettlementRunning = true;
    try {
      await settleRewardAttendance();
    } catch (error) {
      console.error("출석 포인트 정산 실패", error);
    } finally {
      rewardSettlementRunning = false;
    }
  };
  void settleRewards();
  setInterval(() => void settleRewards(), 60_000).unref();
  void settlePreviousWeekCounts().catch(error =>
    console.error("주간 수업 횟수 자동 누적 확인 실패", error)
  );
  const weeklySettlementTimer = setInterval(
    () => {
      void settlePreviousWeekCounts().catch(error =>
        console.error("주간 수업 횟수 자동 누적 확인 실패", error)
      );
    },
    60 * 60 * 1000
  );
  weeklySettlementTimer.unref();
  // 매주 월요일이 되면(자정 이후 아무 때나) 미리 지정해둔 미등록
  // 요일을 그 주에 한 번씩 자동으로 채워 넣는다. 이미 값이 있는
  // 날짜는 건드리지 않으므로 관리자가 나중에 자유롭게 수정할 수 있다.
  void applyWeeklyAutoUnregisteredDays().catch(error =>
    console.error("주간 자동 미등록 처리 확인 실패", error)
  );
  const autoUnregisteredWeekdaysTimer = setInterval(
    () => {
      void applyWeeklyAutoUnregisteredDays().catch(error =>
        console.error("주간 자동 미등록 처리 확인 실패", error)
      );
    },
    60 * 60 * 1000
  );
  autoUnregisteredWeekdaysTimer.unref();
  void dispatchRemainingOneNotifications().catch(error =>
    console.error("잔여 1회 보호자 알림 확인 실패", error)
  );
  const remainingCountNotificationTimer = setInterval(() => {
    void dispatchRemainingOneNotifications().catch(error =>
      console.error("잔여 1회 보호자 알림 확인 실패", error)
    );
  }, 60 * 1000);
  remainingCountNotificationTimer.unref();
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
    res.set("Cache-Control", "no-store");
    res.type("application/manifest+json").send({
      id: "/p/",
      name: "해밀학원 보호자 알림",
      short_name: "해밀 보호자",
      description: "자녀의 수업일지와 등하원 알림",
      start_url: token ? `/p/${token}` : "/p/",
      scope: "/p/",
      display: "fullscreen",
      display_override: ["fullscreen", "standalone"],
      prefer_related_applications: false,
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
  registerAttendanceLiveUpdates(app);
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
    void initializeMathProgress();
  });
}

startServer().catch(console.error);
