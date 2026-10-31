"use client";
// One clock for the whole page: the pen on the trace and the front on the map read the same minute.
// It is kept in localStorage, so a returning reader finds the pen where they left it.
import { useSyncExternalStore } from "react";

const KEY = "rasuwa-pen-minute";
export const PARK = 13; // 08:50: the front just past Syabrubesi (12.3 min)

const listeners = new Set<() => void>();
let minute: number | null = null;

function read() {
  if (minute === null) {
    try {
      const saved = Number(localStorage.getItem(KEY));
      minute = saved > 0 ? saved : PARK;
    } catch {
      minute = PARK;
    }
  }
  return minute;
}

function setT(v: number) {
  minute = Math.round(v); // the pen settles on whole minutes
  try { localStorage.setItem(KEY, String(minute)); } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useTime() {
  const t = useSyncExternalStore(subscribe, read, () => PARK);
  return { t, setT };
}
