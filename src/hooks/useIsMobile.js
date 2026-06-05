import { useEffect, useState } from "react";

// The single mobile breakpoint for the app shell. The batch treats < 768px as
// mobile: no autofocus on load, burger drawer, top tab row, floating command,
// full-screen graph. Desktop keeps the rail + chat-column layout.
export const MOBILE_QUERY = "(max-width: 767px)";

export function isMobileViewport() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

/** Subscribe a component to the mobile breakpoint. */
export function useIsMobile() {
  const [mobile, setMobile] = useState(isMobileViewport);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(mq.matches);
    onChange();
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);
  return mobile;
}
