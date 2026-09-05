import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getPwaInstallSnapshot,
  requestPwaInstall,
  subscribePwaInstall,
} from "@/lib/pwaInstall";
import {
  detectPwaInstallEnvironment,
  getManualInstallInstruction,
} from "@shared/pwaInstallRules";
import { Bell, Chrome, Download, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const INSTALL_DISMISS_KEY = "haemil.parentPwa.installDismissedUntil";
const INSTALL_DISMISS_DAYS = 7;

function isInstallSnoozed() {
  try {
    const until = Number(window.localStorage.getItem(INSTALL_DISMISS_KEY));
    if (Number.isFinite(until) && until > Date.now()) return true;
    window.localStorage.removeItem(INSTALL_DISMISS_KEY);
  } catch {
    // The guide remains visible when storage is unavailable.
  }
  return false;
}

export function PwaInstallPrompt({ compact = false }: { compact?: boolean }) {
  const initialSnapshot = getPwaInstallSnapshot();
  const [promptAvailable, setPromptAvailable] = useState(
    initialSnapshot.promptAvailable
  );
  const [installed, setInstalled] = useState(initialSnapshot.installed);
  const [snoozed, setSnoozed] = useState(isInstallSnoozed);
  const [guideOpen, setGuideOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [externalOpenFailed, setExternalOpenFailed] = useState(false);
  const environment = useMemo(
    () => detectPwaInstallEnvironment(window.navigator.userAgent),
    []
  );
  const manualInstruction = getManualInstallInstruction(environment);

  useEffect(() => {
    const unsubscribe = subscribePwaInstall(snapshot => {
      setPromptAvailable(snapshot.promptAvailable);
      setInstalled(snapshot.installed);
    });
    const handleInstalled = () => {
      try {
        window.localStorage.removeItem(INSTALL_DISMISS_KEY);
      } catch {
        // Installation still completes when storage cleanup is unavailable.
      }
      setInstalled(true);
      setGuideOpen(false);
      toast.success("해밀 보호자 앱 설치가 완료되었습니다.");
    };
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      unsubscribe();
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const install = async () => {
    setInstallMessage(null);
    setExternalOpenFailed(false);
    if (environment.isInAppBrowser || !promptAvailable) {
      setGuideOpen(true);
      return;
    }
    setInstalling(true);
    const outcome = await requestPwaInstall();
    setInstalling(false);
    if (outcome === "accepted") {
      setInstallMessage("설치를 진행했습니다. 완료되면 이 안내가 자동으로 사라집니다.");
      toast.success("앱 설치를 진행합니다.");
      return;
    }
    if (outcome === "dismissed") {
      setInstallMessage("설치를 취소했습니다. 원할 때 다시 설치 방법을 확인할 수 있습니다.");
      toast.info("앱 설치를 취소했습니다.");
      return;
    }
    setGuideOpen(true);
    if (outcome === "error")
      setInstallMessage("자동 설치창을 열지 못했습니다. 아래 방법으로 설치해 주세요.");
  };
  const snooze = () => {
    try {
      window.localStorage.setItem(
        INSTALL_DISMISS_KEY,
        String(Date.now() + INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000)
      );
    } catch {
      // Hide for the current page even when storage is unavailable.
    }
    setGuideOpen(false);
    setSnoozed(true);
  };
  const openAndroidBrowser = (packageName: string) => {
    setExternalOpenFailed(false);
    try {
      const current = new URL(window.location.href);
      const target = `${current.host}${current.pathname}${current.search}${current.hash}`;
      window.location.href = `intent://${target}#Intent;scheme=https;package=${packageName};end`;
      window.setTimeout(() => {
        if (document.visibilityState === "visible") setExternalOpenFailed(true);
      }, 1500);
    } catch {
      setExternalOpenFailed(true);
    }
  };

  if (installed || snoozed) return null;

  return (
    <>
      <div
        className={
          compact
            ? "rounded-xl border border-white/10 bg-white/5 p-3"
            : "rounded-2xl border border-[#DCCB9C] bg-[#FFF9E8] p-4 shadow-[0_8px_22px_rgba(83,68,31,0.08)]"
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
              홈 화면에서 바로 열고 등·하원 및 수업 알림을 빠르게 확인할 수 있습니다.
            </p>
            {!promptAvailable && !environment.isInAppBrowser && (
              <p className={compact ? "mt-2 text-[10px] leading-4 text-[#D8C59A]" : "mt-2 text-[11px] leading-5 text-[#8A6C35]"}>
                {manualInstruction}
              </p>
            )}
            {environment.isInAppBrowser && (
              <p className={compact ? "mt-2 text-[10px] leading-4 text-[#D8C59A]" : "mt-2 text-[11px] leading-5 text-[#8A6C35]"}>
                {environment.inAppName ?? "현재 앱"} 안에서는 외부 브라우저로 열어 설치할 수 있습니다.
              </p>
            )}
            {installMessage && <p className={compact ? "mt-2 text-[10px] leading-4 text-[#D8C59A]" : "mt-2 text-[11px] leading-5 text-[#667875]"}>{installMessage}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={compact ? "secondary" : "default"}
                className={compact ? "" : "journal-primary-button"}
                onClick={install}
                disabled={installing}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {installing ? "설치창 여는 중…" : "앱 설치하기"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={compact ? "text-[#D8C59A] hover:bg-white/10 hover:text-white" : "text-[#765E10]"}
                onClick={snooze}
              >
                나중에
              </Button>
            </div>
          </div>
        </div>
      </div>
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="journal-dialog sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-[#193D3C]">
              {environment.isInAppBrowser ? "외부 브라우저로 열어주세요" : "앱 설치 방법"}
            </DialogTitle>
            <DialogDescription className="leading-6 text-[#657570]">
              {environment.isInAppBrowser
                ? "현재 브라우저에서는 앱 설치가 제한될 수 있습니다. Chrome 또는 삼성 인터넷으로 열어주세요."
                : manualInstruction}
            </DialogDescription>
          </DialogHeader>
          {environment.isInAppBrowser && environment.isAndroid && (
            <div className="grid gap-2 py-2 sm:grid-cols-2">
              <Button
                className="journal-primary-button"
                onClick={() => openAndroidBrowser("com.android.chrome")}
              >
                <Chrome className="mr-2 h-4 w-4" />Chrome으로 열기
              </Button>
              <Button
                variant="outline"
                className="border-[#CFC19A] bg-[#FFFDF7] text-[#315B57]"
                onClick={() => openAndroidBrowser("com.sec.android.app.sbrowser")}
              >
                <Smartphone className="mr-2 h-4 w-4" />삼성 인터넷으로 열기
              </Button>
            </div>
          )}
          {environment.isInAppBrowser && (
            <div className="rounded-xl border border-[#E1D5B5] bg-[#FFF9E8] p-3 text-xs leading-5 text-[#765E10]">
              {environment.isIos
                ? "화면의 공유 또는 더보기 메뉴에서 Safari로 열기를 선택한 뒤, Safari 하단 공유 버튼 → 홈 화면에 추가를 눌러주세요."
                : "버튼이 열리지 않으면 현재 화면의 메뉴(⋮)에서 ‘다른 브라우저로 열기’를 선택해 주세요."}
              {externalOpenFailed && <b className="mt-2 block text-[#A05242]">외부 브라우저를 자동으로 열지 못했습니다. 위의 수동 방법을 이용해 주세요.</b>}
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" className="text-[#765E10]" onClick={snooze}>7일간 보지 않기</Button>
            <Button variant="outline" onClick={() => setGuideOpen(false)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ParentNotificationPrompt({ token }: { token: string }) {
  const { user } = useAuth();
  // v2: 예전 버전은 서버가 "발송 성공"이라고만 하면 곧바로 확인 완료로
  // 저장했다. 이 값은 앱을 지워도 브라우저(크롬)에 그대로 남아있어서,
  // 새로 설치해도 실제 수신 여부를 물어보는 새 절차를 건너뛰고 배너가
  // 계속 숨어 있었다. 키에 버전을 붙여 예전 값을 전부 무효화한다.
  const confirmationKey = `haemil.parentPush.tested.v2:${token}`;
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
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const testNotification = trpc.academy.parentPush.test.useMutation({
    onSuccess: result => {
      if (result.sent > 0) {
        // 서버가 발송에 "성공"한 것과, 이 휴대폰이 실제로 알림을 화면에
        // 띄운 것은 다르다. Android는 이 앱만 따로 알림을 끌 수 있는
        // 스위치를 갖고 있고(설정 > 앱 > 해밀 보호자 > 알림), 그게 꺼져
        // 있으면 서버 발송은 성공해도 보호자는 아무것도 못 본다. 이
        // 차이는 웹 표준 API로 알아낼 방법이 없으므로, 보호자에게 직접
        // "받았는지" 물어보고 그 대답으로만 안내 카드를 숨긴다.
        setAwaitingConfirmation(true);
      }
      else toast.error("등록된 알림 기기를 찾지 못했습니다. 알림을 다시 설정해 주세요.");
    },
    onError: error => toast.error(error.message),
  });
  const confirmNotificationReceived = () => {
    window.localStorage.setItem(confirmationKey, "1");
    setTestConfirmed(true);
    setAwaitingConfirmation(false);
    toast.success("알림 설정이 확인되었습니다. 안내창을 숨깁니다.");
  };
  const denyNotificationReceived = () => {
    setAwaitingConfirmation(false);
    toast.error(
      "휴대폰 설정 > 앱 > 해밀 보호자 > 알림에서 알림이 허용되어 있는지 확인한 뒤 다시 시도해 주세요."
    );
  };
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
        !("Notification" in window) ||
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
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
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
    setAwaitingConfirmation(false);
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
  // Once a guardian has completed setup and confirmed a test notification we
  // hide this card. However that "confirmed" flag lives in localStorage and
  // never expires, so if notifications later stop working (permission
  // revoked in phone settings, app reinstalled without clearing site data,
  // etc.) the card must come back so the guardian can see what happened and
  // re-enable it. Only suppress the card while everything still looks fine.
  if (user?.role === "admin") return null;
  if (testConfirmed && state !== "blocked" && state !== "unsupported")
    return null;
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
              {awaitingConfirmation ? (
                <div className="mt-2 rounded-lg border border-[#D9C792] bg-[#FFFBEF] p-2.5">
                  <p className="text-xs leading-5 text-[#6E5B2B]">
                    방금 보낸 테스트 알림을 이 휴대폰에서 받으셨나요?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      className="journal-primary-button"
                      onClick={confirmNotificationReceived}
                    >
                      네, 받았어요
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-white"
                      onClick={denyNotificationReceived}
                    >
                      못 받았어요
                    </Button>
                  </div>
                </div>
              ) : (
                <>
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
                </>
              )}
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
