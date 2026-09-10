import { createContext, useEffect, useRef, type RefObject } from "react";
export const AvatarNavigationContext = createContext(false);
const marker = "haemilAvatarOverlay";
export function useAvatarBackGuard(
  open: boolean,
  onClose: () => void,
  enabled = true
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
    window.addEventListener("popstate", cleanStale);
    return () => window.removeEventListener("popstate", cleanStale);
  }, [enabled, open]);
  useEffect(() => {
    if (!open || !enabled) return;
    const id = crypto.randomUUID();
    history.pushState({ ...history.state, [marker]: id }, "", location.href);
    const root = document.documentElement,
      body = document.body;
    const oldRoot = root.style.overscrollBehavior,
      oldBody = body.style.overscrollBehavior;
    root.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    const pop = () => {
      if (history.state?.[marker] !== id) close.current();
    };
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      root.style.overscrollBehavior = oldRoot;
      body.style.overscrollBehavior = oldBody;
      if (history.state?.[marker] === id) history.back();
    };
  }, [open, enabled]);
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
