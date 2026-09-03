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
let installed = false;
const listeners = new Set<PwaInstallListener>();

function standaloneMode() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    iosNavigator.standalone === true
  );
}

function snapshot(): PwaInstallSnapshot {
  return {
    promptAvailable: Boolean(deferredPrompt),
    installed: installed || standaloneMode(),
  };
}

function notify() {
  const current = snapshot();
  listeners.forEach(listener => listener(current));
}

export function initializePwaInstallCapture() {
  if (initialized) return;
  initialized = true;
  installed = standaloneMode();
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
  const displayMode = window.matchMedia("(display-mode: standalone)");
  displayMode.addEventListener?.("change", () => {
    installed = standaloneMode();
    notify();
  });
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
