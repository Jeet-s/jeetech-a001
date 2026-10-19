import { useEffect, useState } from "react";

/**
 * Shared layout facts screens must respect. bannerHeight is measured from the
 * real banner in App.tsx (0 when no banner shows) so bottom controls are never
 * hidden under the ad.
 */
let bannerHeight = 0;
const listeners = new Set<(h: number) => void>();

export const layout = {
  setBannerHeight(h: number): void {
    const v = Math.round(h);
    if (v === bannerHeight) return;
    bannerHeight = v;
    listeners.forEach((l) => l(v));
  },
};

export function useBannerHeight(): number {
  const [h, setH] = useState(bannerHeight);
  useEffect(() => {
    listeners.add(setH);
    return () => {
      listeners.delete(setH);
    };
  }, []);
  return h;
}
