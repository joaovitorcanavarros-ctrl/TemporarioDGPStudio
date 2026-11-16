import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "motion/react";

type EntryPhase = "idle" | "centered" | "docking";

interface DockTarget {
  x: number;
  y: number;
  scale: number;
  fadeOut: boolean;
}

interface SystemEntryContextValue {
  startEntrySplash: () => void;
  isBrandLogoHidden: boolean;
  isEntryActive: boolean;
}

const SystemEntryContext = createContext<SystemEntryContextValue>({
  startEntrySplash: () => {},
  isBrandLogoHidden: false,
  isEntryActive: false,
});

export function useSystemEntry() {
  return useContext(SystemEntryContext);
}

const MIN_CENTER_HOLD_MS = 1500;
const MAX_CENTER_WAIT_MS = 6000;
const DOCK_DURATION_S = 1.85;

export function SystemEntryProvider({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<EntryPhase>("idle");
  const [dockTarget, setDockTarget] = useState<DockTarget | null>(null);
  const startedAtRef = useRef<number>(0);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const splashImgRef = useRef<HTMLImageElement | null>(null);

  const startEntrySplash = useCallback(() => {
    if (reduceMotion) return;
    startedAtRef.current = performance.now();
    setDockTarget(null);
    setPhase("centered");
  }, [reduceMotion]);

  useEffect(() => {
    if (phase !== "centered") return;

    let cancelled = false;

    const tryStartDocking = () => {
      if (cancelled) return;
      const elapsed = performance.now() - startedAtRef.current;

      if (elapsed >= MAX_CENTER_WAIT_MS) {
        setPhase("idle");
        setDockTarget(null);
        return;
      }

      if (elapsed < MIN_CENTER_HOLD_MS) return;

      const appShellMounted = Boolean(document.querySelector('[data-testid="system-title"]'));
      if (!appShellMounted) return;

      const overlayEl = overlayRef.current;
      const fromImg = splashImgRef.current;
      if (!overlayEl || !fromImg) return;
      const overlayRect = overlayEl.getBoundingClientRect();
      const fromSize = fromImg.offsetWidth;
      if (fromSize <= 0 || overlayRect.width <= 0) return;

      const fromCenterX = overlayRect.left + overlayRect.width / 2;
      const fromCenterY = overlayRect.top + overlayRect.height / 2;

      const targetImg = document.querySelector(
        'aside[data-testid="sidebar"] [data-testid="brand-logo"]'
      ) as HTMLElement | null;

      if (targetImg) {
        const toRect = targetImg.getBoundingClientRect();
        if (toRect.width > 0 && toRect.height > 0) {
          const toCenterX = toRect.left + toRect.width / 2;
          const toCenterY = toRect.top + toRect.height / 2;
          setDockTarget({
            x: toCenterX - fromCenterX,
            y: toCenterY - fromCenterY,
            scale: toRect.width / fromSize,
            fadeOut: false,
          });
          setPhase("docking");
          return;
        }
      }

      // Mobile / collapsed layout without visible desktop sidebar logo
      setDockTarget({
        x: 38 - fromCenterX,
        y: 38 - fromCenterY,
        scale: 0.28,
        fadeOut: true,
      });
      setPhase("docking");
    };

    const intervalId = window.setInterval(tryStartDocking, 50);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [phase]);

  // Safety cleanup in case docking animation is interrupted
  useEffect(() => {
    if (phase !== "docking") return;
    const timeoutId = window.setTimeout(() => {
      setPhase("idle");
      setDockTarget(null);
    }, DOCK_DURATION_S * 1000 + 450);
    return () => window.clearTimeout(timeoutId);
  }, [phase]);

  const isBrandLogoHidden = phase === "docking" && Boolean(dockTarget && !dockTarget.fadeOut);

  const value = useMemo<SystemEntryContextValue>(
    () => ({
      startEntrySplash,
      isBrandLogoHidden,
      isEntryActive: phase !== "idle",
    }),
    [startEntrySplash, isBrandLogoHidden, phase]
  );

  return (
    <SystemEntryContext.Provider value={value}>
      {children}

      {phase !== "idle" && (
        <div
          ref={overlayRef}
          aria-hidden="true"
          className={`fixed inset-0 z-[100] flex items-center justify-center ${
            phase === "docking" ? "pointer-events-none" : "pointer-events-auto"
          }`}
        >
          {/* Dark institutional backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === "docking" ? 0 : 1 }}
            transition={
              phase === "docking"
                ? { duration: 1.5, delay: 0.12, ease: [0.4, 0, 0.2, 1] }
                : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
            }
            className="absolute inset-0 bg-[#070B14]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(220,38,38,0.16),rgba(11,19,43,0.92)_52%,#070B14_100%)]" />
          </motion.div>

          {/* Subtle ambient halo behind centered emblem */}
          <motion.div
            initial={{ opacity: 0, scale: 0.72 }}
            animate={
              phase === "docking"
                ? { opacity: 0, scale: 0.45 }
                : { opacity: 0.85, scale: 1 }
            }
            transition={{
              duration: phase === "docking" ? 1.15 : 0.75,
              ease: [0.4, 0, 0.2, 1],
            }}
            className="pointer-events-none absolute size-52 sm:size-64 rounded-full bg-red-600/20 blur-3xl"
          />

          {/* CBMMT Emblem animating from center to sidebar brand-logo position */}
          <motion.img
            ref={splashImgRef}
            src="/cbmmt-logo.png"
            alt=""
            initial={{ opacity: 0, scale: 0.78, x: 0, y: 0 }}
            animate={
              phase === "docking" && dockTarget
                ? {
                    opacity: dockTarget.fadeOut ? 0 : 1,
                    scale: dockTarget.scale,
                    x: dockTarget.x,
                    y: dockTarget.y,
                  }
                : { opacity: 1, scale: 1, x: 0, y: 0 }
            }
            transition={
              phase === "docking"
                ? { duration: DOCK_DURATION_S, ease: [0.42, 0, 0.18, 1] }
                : { duration: 0.75, ease: [0.22, 1, 0.36, 1] }
            }
            onAnimationComplete={() => {
              if (phase === "docking") {
                setPhase("idle");
                setDockTarget(null);
              }
            }}
            className="relative z-10 size-28 sm:size-36 object-contain select-none will-change-transform drop-shadow-[0_14px_36px_rgba(220,38,38,0.45)]"
          />
        </div>
      )}
    </SystemEntryContext.Provider>
  );
}
