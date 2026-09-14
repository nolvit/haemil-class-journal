import {
  createContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
export const AvatarNavigationContext = createContext(false);
let suppressNextOverlayPop = false;

export function handleOverlayBack(
  onClose: () => boolean | void,
  rearm: () => void
) {
  const closed = onClose();
  if (closed === false) {
    rearm();
    return "rearmed" as const;
  }
  return "closed" as const;
}

function overlayPopIsSuppressed() {
  return suppressNextOverlayPop;
}
export function useAvatarBackGuard(
  open: boolean,
  onClose: () => boolean | void,
  enabled = true,
  marker = "haemilAvatarOverlay"
) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!enabled || open) return;
    const cleanStale = () => {
      if (history.state?.[marker]) {
        const state = { ...history.state };
        delete state[marker];
        history.replaceState(state, "", location.href);
      }
    };
    cleanStale();
    const cleanAfterPop = () => {
      if (!overlayPopIsSuppressed()) cleanStale();
    };
    window.addEventListener("popstate", cleanAfterPop);
    return () => window.removeEventListener("popstate", cleanAfterPop);
  }, [enabled, open, marker]);
  useLayoutEffect(() => {
    if (!open || !enabled) return;
    const id = crypto.randomUUID();
    history.pushState({ ...history.state, [marker]: id }, "", location.href);
    const root = document.documentElement,
      body = document.body;
    const oldRoot = root.style.overscrollBehavior,
      oldBody = body.style.overscrollBehavior;
    root.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    body.dataset.avatarOverlay = "open";
    const pop = () => {
      if (overlayPopIsSuppressed()) return;
      if (history.state?.[marker] !== id) {
        handleOverlayBack(close.current, () => {
          // A nested overlay may be skipped by Android's system Back handling.
          // If the owner kept itself open after closing that child, restore the
          // guard immediately so the world cannot fall through to its parent.
          history.pushState(
            { ...history.state, [marker]: id },
            "",
            location.href
          );
        });
      }
    };
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      root.style.overscrollBehavior = oldRoot;
      body.style.overscrollBehavior = oldBody;
      delete body.dataset.avatarOverlay;
      if (history.state?.[marker] === id) {
        // A button-driven close removes this hook before its history entry.
        // Suppress the resulting programmatic pop in every parent guard.
        suppressNextOverlayPop = true;
        window.addEventListener(
          "popstate",
          () => window.setTimeout(() => (suppressNextOverlayPop = false), 0),
          { once: true }
        );
        history.back();
        window.setTimeout(() => (suppressNextOverlayPop = false), 500);
      }
    };
  }, [open, enabled, marker]);
}
// Consume horizontal gestures even at scroll boundaries so Chromium cannot
// interpret an exhausted image pan as history navigation. Vertical movement
// also uses the same bounded surface; zoom remains available via the slider.
export function useBoundedImagePan(
  ref: RefObject<HTMLDivElement | null>,
  active: boolean
) {
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let detach = () => {};
    const attach = () => {
      const el = ref.current;
      if (!el) {
        frame = requestAnimationFrame(attach);
        return;
      }
      let drag: {
        id: number;
        x: number;
        y: number;
        left: number;
        top: number;
      } | null = null;
      const down = (e: PointerEvent) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        drag = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          left: el.scrollLeft,
          top: el.scrollTop,
        };
        el.setPointerCapture(e.pointerId);
      };
      const move = (e: PointerEvent) => {
        if (!drag || drag.id !== e.pointerId) return;
        e.preventDefault();
        el.scrollLeft = drag.left + drag.x - e.clientX;
        el.scrollTop = drag.top + drag.y - e.clientY;
      };
      const end = () => {
        drag = null;
      };
      const wheel = (e: WheelEvent) => {
        if (e.ctrlKey) return;
        e.preventDefault();
        el.scrollLeft += e.shiftKey ? e.deltaY : e.deltaX;
        el.scrollTop += e.shiftKey ? 0 : e.deltaY;
      };
      const touch = (e: TouchEvent) => e.preventDefault();
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
      el.addEventListener("wheel", wheel, { passive: false });
      el.addEventListener("touchmove", touch, { passive: false });
      detach = () => {
        el.removeEventListener("pointerdown", down);
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", end);
        el.removeEventListener("pointercancel", end);
        el.removeEventListener("wheel", wheel);
        el.removeEventListener("touchmove", touch);
      };
    };
    attach();
    return () => {
      cancelAnimationFrame(frame);
      detach();
    };
  }, [active, ref]);
}
