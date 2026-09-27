import { useSyncExternalStore } from "react";

export type HeroPhase = "INTRO_LOADING" | "INTRO_PLAYING" | "INTRO_ENDING" | "HERO_READY";

// Document lifetime only: survives route changes; a real reload creates a new intro.
let phase: HeroPhase = "INTRO_LOADING";
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function setHeroPhase(next: HeroPhase) {
  if (phase === "HERO_READY" || phase === next) return;
  phase = next;
  listeners.forEach((listener) => listener());
}

export function useHeroPhase() {
  return useSyncExternalStore(subscribe, () => phase);
}
