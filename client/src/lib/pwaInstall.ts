export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaInstallSnapshot = {
  promptAvailable: boolean;
  installed: boolean;
};

type PwaInstallListener = (snapshot: PwaInstallSnapshot) => void;

let initialized = false;
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<PwaInstallListener>();
const APP_DISPLAY_MODES = ["standalone", "fullscreen"] as const;

function appDisplayMode() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    APP_DISPLAY_MODES.some(mode =>
      window.matchMedia(`(display-mode: ${mode})`).matches
    ) ||
    iosNavigator.standalone === true
  );
}

function snapshot(): PwaInstallSnapshot {
  return {
    promptAvailable: Boolean(deferredPrompt),
    // This describes the current window, not an installation in another tab.
    installed: appDisplayMode(),
  };
}

function notify() {
  const current = snapshot();
  listeners.forEach(listener => listener(current));
}

export function initializePwaInstallCapture() {
  if (initialized) return;
  initialized = true;
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
  window.addEventListener("focus", notify);
  document.addEventListener("visibilitychange", notify);
  for (const mode of APP_DISPLAY_MODES) {
    window.matchMedia(`(display-mode: ${mode})`).addEventListener?.("change", notify);
  }
}

export function getPwaInstallSnapshot() {
  return snapshot();
}

export function subscribePwaInstall(listener: PwaInstallListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function requestPwaInstall(): Promise<
  "accepted" | "dismissed" | "unavailable" | "error"
> {
  const event = deferredPrompt;
  if (!event) return "unavailable";
  deferredPrompt = null;
  notify();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome;
  } catch {
    return "error";
  }
}
