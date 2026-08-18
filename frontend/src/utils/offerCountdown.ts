// Shared 10-Minuten Angebots-Countdown
// Gleiches Ablaufdatum in Paywall + Startseite
import { useEffect, useState, useRef } from "react";
import { storage } from "./storage";

export const OFFER_EXPIRY_KEY = "cleanu.lifetime_offer_expiry";
export const OFFER_DURATION_MS = 10 * 60 * 1000;

export function useOfferCountdown() {
  const [secsLeft, setSecsLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const raw = await storage.getItem<string>(OFFER_EXPIRY_KEY, "");
      let expiry = raw ? parseInt(raw as string) : 0;
      const now = Date.now();
      if (!expiry || expiry <= now) {
        expiry = now + OFFER_DURATION_MS;
        await storage.setItem(OFFER_EXPIRY_KEY, expiry.toString());
      }
      const remaining = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      setSecsLeft(remaining);
    })();
  }, []);

  useEffect(() => {
    if (secsLeft === null || secsLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setSecsLeft(s => {
        if (s === null || s <= 1) { clearInterval(timerRef.current!); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [secsLeft !== null && secsLeft > 0]);

  const isActive = (secsLeft ?? 0) > 0;
  const mm = String(Math.floor((secsLeft ?? 0) / 60)).padStart(2, "0");
  const ss = String((secsLeft ?? 0) % 60).padStart(2, "0");
  return { isActive, label: `${mm}:${ss}`, secsLeft };
}
