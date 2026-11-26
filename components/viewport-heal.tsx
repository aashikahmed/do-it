"use client";

import { useEffect } from "react";

/**
 * An iOS Home Screen app bug (iOS 26.0, reported again in the iOS 27 beta; WebKit bug 297779): after the keyboard
 * closes, the viewport can stay out of step with the screen until the app is quit. Everything pinned to the bottom
 * (the check-in bar, every sheet) then sits partly below the screen, and a sheet shows only its title.
 * When the visible viewport and the layout viewport disagree with no keyboard up, make WebKit measure again by
 * taking the page out of layout for one synchronous reflow. Does nothing in a browser tab or off iOS.
 */
export function ViewportHeal() {
  useEffect(() => {
    const vv = window.visualViewport;
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
    const standalone = (navigator as { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;
    if (!vv || !ios || !standalone) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const typing = () => {
      const el = document.activeElement;
      return el instanceof HTMLElement && (el.isContentEditable || el.matches("input, textarea, select"));
    };
    // pinch zoom (iOS allows it whatever the viewport tag says) makes them differ on purpose
    const outOfStep = () => vv.scale < 1.01 && (Math.abs(window.innerHeight - vv.height) > 4 || Math.abs(vv.offsetTop) > 4);

    const heal = () => {
      if (typing() || !outOfStep()) return;
      const root = document.querySelector<HTMLElement>(".app-column");
      if (!root) return;
      const y = window.scrollY;
      root.style.display = "none";
      void root.offsetHeight; // the forced reflow is the point
      root.style.display = "";
      window.scrollTo(0, y);
    };
    // after the keyboard has finished closing
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(heal, 300);
    };

    document.addEventListener("focusout", soon);
    vv.addEventListener("resize", soon);
    document.addEventListener("visibilitychange", soon);
    soon();
    return () => {
      clearTimeout(timer);
      document.removeEventListener("focusout", soon);
      vv.removeEventListener("resize", soon);
      document.removeEventListener("visibilitychange", soon);
    };
  }, []);
  return null;
}
