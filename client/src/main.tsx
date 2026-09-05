import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import "./index.css";
import { initializePwaInstallCapture } from "./lib/pwaInstall";

initializePwaInstallCapture();

const parentToken = window.location.pathname.match(
  /^\/p\/([A-Za-z0-9_-]{8,64})/
)?.[1];
const isCheckIn = window.location.pathname === "/check-in";
const manifest = document.createElement("link");
manifest.rel = "manifest";
manifest.href = parentToken
  ? `/pwa/parent.webmanifest?token=${encodeURIComponent(parentToken)}`
  : isCheckIn
    ? "/check-in.webmanifest"
    : "/admin.webmanifest";
document.head.appendChild(manifest);
const appIcon = document.createElement("link");
appIcon.rel = "apple-touch-icon";
appIcon.href = "/icons/haemil-logo-180.png";
document.head.appendChild(appIcon);
const themeColor = document.createElement("meta");
themeColor.name = "theme-color";
themeColor.content = parentToken ? "#315B57" : "#193D3C";
document.head.appendChild(themeColor);
if (parentToken) {
  const appleCapable = document.createElement("meta");
  appleCapable.name = "apple-mobile-web-app-capable";
  appleCapable.content = "yes";
  document.head.appendChild(appleCapable);
  const appleTitle = document.createElement("meta");
  appleTitle.name = "apple-mobile-web-app-title";
  appleTitle.content = "해밀 보호자";
  document.head.appendChild(appleTitle);
  const appleStatusBar = document.createElement("meta");
  appleStatusBar.name = "apple-mobile-web-app-status-bar-style";
  appleStatusBar.content = "default";
  document.head.appendChild(appleStatusBar);
}
if ("serviceWorker" in navigator)
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(registration => {
        // 보호자 대부분은 이미 앱을 설치해 둔 상태라, 배포할 때마다 앱을
        // 지우고 재설치해 달라고 할 수 없다. 새 서비스워커가 화면을
        // 장악(activate)하면 그 즉시 페이지를 한 번 새로고침해서, 열려
        // 있던 앱이 자동으로 최신 코드를 받도록 한다.
        let reloaded = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (reloaded) return;
          reloaded = true;
          window.location.reload();
        });
        // 브라우저는 새 배포가 있는지 자주 확인하지 않는다(대개 하루에
        // 한 번 정도). 앱이 다시 화면에 보일 때마다 직접 확인을
        // 요청해서, 백그라운드에 오래 떠 있던 앱도 곧바로 최신 버전을
        // 받아오게 한다.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible")
            void registration.update();
        });
      })
      .catch(() => {
        // The page remains usable and the manual install guide stays available.
      });
  });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;
  if (import.meta.env.VITE_OAUTH_PORTAL_URL && import.meta.env.VITE_APP_ID) startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
