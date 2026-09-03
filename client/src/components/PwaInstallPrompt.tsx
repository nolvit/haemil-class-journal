import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { Bell, Download, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallPrompt({ compact = false }: { compact?: boolean }) {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches
  );

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const appInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", appInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", appInstalled);
    };
  }, []);

  if (installed) return null;
  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstallEvent(null);
  };
  return (
    <div
      className={
        compact
          ? "rounded-xl border border-white/10 bg-white/5 p-3"
          : "rounded-2xl border border-[#DCCB9C] bg-[#FFF9E8] p-4"
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={
            compact
              ? "rounded-lg bg-white/10 p-2 text-[#D8C59A]"
              : "rounded-xl bg-[#F5E6B8] p-2.5 text-[#6E5918]"
          }
        >
          <Smartphone className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <b
            className={
              compact ? "text-xs text-[#F8F5EE]" : "text-sm text-[#294A47]"
            }
          >
            앱으로 설치하면 더 편리해요
          </b>
          <p
            className={
              compact
                ? "mt-1 text-[10px] leading-4 text-[#AAB9B6]"
                : "mt-1 text-xs leading-5 text-[#71817D]"
            }
          >
            홈 화면에서 바로 열고 새 알림을 빠르게 확인할 수 있습니다.
          </p>
          {installEvent ? (
            <Button
              size="sm"
              variant={compact ? "secondary" : "outline"}
              className="mt-2"
              onClick={install}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />앱 설치
            </Button>
          ) : (
            <p
              className={
                compact
                  ? "mt-2 text-[10px] text-[#D8C59A]"
                  : "mt-2 text-[11px] text-[#8A6C35]"
              }
            >
              브라우저 메뉴에서 ‘홈 화면에 추가’를 선택해 주세요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ParentNotificationPrompt({ token }: { token: string }) {
  const { user } = useAuth();
  const confirmationKey = `haemil.parentPush.tested:${token}`;
  const [testConfirmed, setTestConfirmed] = useState(
    () => window.localStorage.getItem(confirmationKey) === "1"
  );
  const [state, setState] = useState<
    "idle" | "loading" | "enabled" | "blocked" | "unsupported"
  >("idle");
  const config = trpc.academy.parentPush.config.useQuery(
    { token },
    { enabled: Boolean(token), retry: false }
  );
  const subscribe = trpc.academy.parentPush.subscribe.useMutation();
  const unsubscribe = trpc.academy.parentPush.unsubscribe.useMutation();
  const testNotification = trpc.academy.parentPush.test.useMutation({
    onSuccess: result => {
      if (result.sent > 0) {
        window.localStorage.setItem(confirmationKey, "1");
        setTestConfirmed(true);
        toast.success("테스트 알림을 전송했습니다. 알림 안내창을 숨깁니다.");
      }
      else toast.error("등록된 알림 기기를 찾지 못했습니다. 알림을 다시 설정해 주세요.");
    },
    onError: error => toast.error(error.message),
  });
  useEffect(() => {
    let cancelled = false;
    const restoreExistingSubscription = async () => {
      if (user?.role === "admin") return;
      if ("Notification" in window && Notification.permission === "denied") {
        if (!cancelled) setState("blocked");
        return;
      }
      if (
        !config.data?.available ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        Notification.permission !== "granted"
      )
        return;
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          const payload = existing.toJSON();
          if (payload.endpoint && payload.keys?.p256dh && payload.keys.auth) {
            await subscribe.mutateAsync({
              token,
              subscription: {
                endpoint: payload.endpoint,
                keys: { p256dh: payload.keys.p256dh, auth: payload.keys.auth },
              },
            });
            if (!cancelled) setState("enabled");
          }
        }
      } catch {
        // The regular setup button remains available when the browser lookup fails.
      }
    };
    void restoreExistingSubscription();
    return () => {
      cancelled = true;
    };
  }, [config.data?.available, user?.role]);
  const enable = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    setState("loading");
    try {
      if (!config.data?.available || !config.data.publicKey) {
        setState("unsupported");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "idle");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.data.publicKey),
        }));
      const payload = subscription.toJSON();
      if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys.auth)
        throw new Error("invalid push subscription");
      await subscribe.mutateAsync({
        token,
        subscription: {
          endpoint: payload.endpoint,
          keys: { p256dh: payload.keys.p256dh, auth: payload.keys.auth },
        },
      });
      setState("enabled");
    } catch {
      setState("unsupported");
    }
  };
  const reconnect = async () => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !config.data?.publicKey
    ) {
      setState("unsupported");
      return;
    }
    setState("loading");
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await unsubscribe.mutateAsync({ token, endpoint: existing.endpoint });
        await existing.unsubscribe();
      }
      const fresh = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.data.publicKey),
      });
      const payload = fresh.toJSON();
      if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys.auth)
        throw new Error("invalid push subscription");
      await subscribe.mutateAsync({
        token,
        subscription: {
          endpoint: payload.endpoint,
          keys: { p256dh: payload.keys.p256dh, auth: payload.keys.auth },
        },
      });
      setState("enabled");
      toast.success("모바일 알림을 새로 연결했습니다.");
      await testNotification.mutateAsync({ token });
    } catch {
      setState(
        "Notification" in window && Notification.permission === "denied"
          ? "blocked"
          : "unsupported"
      );
      toast.error("알림을 다시 연결하지 못했습니다. 브라우저의 사이트 알림 설정을 확인해 주세요.");
    }
  };
  if (user?.role === "admin" || testConfirmed) return null;
  return (
    <div className="rounded-2xl border border-[#C9DDD4] bg-[#F1F8F4] p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-[#DDEEE5] p-2.5 text-[#315B57]">
          <Bell className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <b className="text-sm text-[#294A47]">등하원·수업 횟수 알림 받기</b>
          <p className="mt-1 text-xs leading-5 text-[#657570]">
            등하원 알림과 등록 횟수 변경 안내를 이 기기로 받을 수 있습니다.
          </p>
          {state === "enabled" ? (
            <div className="mt-2">
              <p className="text-xs font-semibold text-[#2F7154]">
                알림이 설정되었습니다.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 bg-white"
                disabled={testNotification.isPending}
                onClick={() => testNotification.mutate({ token })}
              >
                {testNotification.isPending ? "전송 중…" : "테스트 알림 보내기"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 text-[#765E10]"
                disabled={testNotification.isPending}
                onClick={reconnect}
              >
                모바일 알림 다시 연결
              </Button>
            </div>
          ) : state !== "blocked" ? (
            <Button
              size="sm"
              className="journal-primary-button mt-2"
              disabled={state === "loading"}
              onClick={enable}
            >
              {state === "loading" ? "설정 중…" : "알림 허용"}
            </Button>
          ) : null}
          {state === "unsupported" && (
            <p className="mt-2 text-xs text-[#A05242]">
              이 브라우저에서는 알림을 사용할 수 없거나 서버 설정이 아직
              완료되지 않았습니다.
            </p>
          )}
          {state === "blocked" && (
            <p className="mt-2 text-xs leading-5 text-[#A05242]">
              휴대폰에서 알림이 차단되어 있습니다. 휴대폰 설정의 앱 또는
              사이트 알림에서 해밀학원 알림을 허용한 뒤 앱을 다시 열어 주세요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(Array.from(raw).map(char => char.charCodeAt(0)));
}
