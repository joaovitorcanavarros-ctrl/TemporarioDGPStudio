"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type React from "react";
import { cn } from "@/lib/utils";

interface ShinyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
}

interface ButtonMetrics {
  width: number;
  height: number;
  radius: number;
}

const ORBIT_DURATION_MS = 11000;

export function ShinyButton({
  children,
  onClick,
  className = "",
  type = "button",
  disabled = false,
  ...props
}: ShinyButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const haloRef = useRef<SVGRectElement>(null);
  const midRef = useRef<SVGRectElement>(null);
  const coreRef = useRef<SVGRectElement>(null);
  const sheenRef = useRef<HTMLSpanElement>(null);
  const glowFilterId = useId().replace(/:/g, "");

  const [metrics, setMetrics] = useState<ButtonMetrics>({
    width: 0,
    height: 0,
    radius: 12,
  });

  useLayoutEffect(() => {
    const el = buttonRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (width <= 0 || height <= 0) return;

      const computedRadius = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius);
      const radius = Number.isFinite(computedRadius)
        ? Math.min(computedRadius, width / 2, height / 2)
        : 12;

      setMetrics((prev) =>
        prev.width === width && prev.height === height && prev.radius === radius
          ? prev
          : { width, height, radius }
      );
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const hasMetrics = metrics.width > 4 && metrics.height > 4;
  const inset = 1;
  const rw = Math.max(2, metrics.width - inset * 2);
  const rh = Math.max(2, metrics.height - inset * 2);
  const rx = Math.max(0, Math.min(metrics.radius - inset, rw / 2, rh / 2));

  useEffect(() => {
    if (!hasMetrics) return;

    const haloEl = haloRef.current;
    const midEl = midRef.current;
    const coreEl = coreRef.current;
    const sheenEl = sheenRef.current;
    if (!haloEl || !midEl || !coreEl) return;

    const geometricPerimeter =
      2 * (rw - 2 * rx) + 2 * (rh - 2 * rx) + 2 * Math.PI * rx;
    const total = haloEl.getTotalLength() || geometricPerimeter;
    if (!Number.isFinite(total) || total <= 0) return;

    const haloLen = total * 0.26;
    const midLen = total * 0.16;
    const coreLen = total * 0.06;
    const midOffset = (haloLen - midLen) / 2;
    const coreOffset = (haloLen - coreLen) / 2;

    haloEl.setAttribute("stroke-dasharray", `${haloLen.toFixed(2)} ${(total - haloLen).toFixed(2)}`);
    midEl.setAttribute("stroke-dasharray", `${midLen.toFixed(2)} ${(total - midLen).toFixed(2)}`);
    coreEl.setAttribute("stroke-dasharray", `${coreLen.toFixed(2)} ${(total - coreLen).toFixed(2)}`);

    if (disabled) {
      haloEl.setAttribute("stroke-dashoffset", "0");
      midEl.setAttribute("stroke-dashoffset", (-midOffset).toFixed(2));
      coreEl.setAttribute("stroke-dashoffset", (-coreOffset).toFixed(2));
      if (sheenEl) {
        sheenEl.style.transform = "translate3d(-120%, 0, 0)";
      }
      return;
    }

    let rafId = 0;
    const startTime = performance.now();

    const tick = (now: number) => {
      const progress = ((now - startTime) % ORBIT_DURATION_MS) / ORBIT_DURATION_MS;
      const head = progress * total;

      haloEl.setAttribute("stroke-dashoffset", (-head).toFixed(2));
      midEl.setAttribute("stroke-dashoffset", (-(head + midOffset)).toFixed(2));
      coreEl.setAttribute("stroke-dashoffset", (-(head + coreOffset)).toFixed(2));

      if (sheenEl) {
        const sheenX = -110 + progress * 270;
        sheenEl.style.transform = `translate3d(${sheenX.toFixed(2)}%, 0, 0)`;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [hasMetrics, rw, rh, rx, disabled]);

  return (
    <button
      ref={buttonRef}
      type={type}
      disabled={disabled}
      className={cn("shiny-cta", className)}
      onClick={onClick}
      {...props}
    >
      {/* Subtle dot-matrix surface texture */}
      <span aria-hidden="true" className="shiny-cta-dots" />

      {/* Slow sweeping diagonal blue sheen across the full button interior */}
      <span aria-hidden="true" className="shiny-cta-sheen-clip">
        <span ref={sheenRef} className="shiny-cta-sheen" />
      </span>

      {/* Full-rectangle blue hover/focus glow */}
      <span aria-hidden="true" className="shiny-cta-hover-glow" />

      {/* Constant-speed luminous light beam orbiting the exact rounded perimeter */}
      {hasMetrics && (
        <svg
          aria-hidden="true"
          className="shiny-cta-svg"
          width={metrics.width}
          height={metrics.height}
          viewBox={`0 0 ${metrics.width} ${metrics.height}`}
          fill="none"
        >
          <defs>
            <filter id={glowFilterId} x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation="2.0" result="blur" />
            </filter>
          </defs>

          {/* Outer royal-blue soft halo */}
          <rect
            ref={haloRef}
            x={inset}
            y={inset}
            width={rw}
            height={rh}
            rx={rx}
            ry={rx}
            stroke="#2563eb"
            strokeWidth={2.5}
            strokeOpacity={0.4}
            strokeLinecap="round"
            filter={`url(#${glowFilterId})`}
          />

          {/* Subtle electric-blue mid beam */}
          <rect
            ref={midRef}
            x={inset}
            y={inset}
            width={rw}
            height={rh}
            rx={rx}
            ry={rx}
            stroke="#60a5fa"
            strokeWidth={1.5}
            strokeOpacity={0.56}
            strokeLinecap="round"
          />

          {/* Soft icy-white leading core */}
          <rect
            ref={coreRef}
            x={inset}
            y={inset}
            width={rw}
            height={rh}
            rx={rx}
            ry={rx}
            stroke="#dbeafe"
            strokeWidth={1.1}
            strokeOpacity={0.58}
            strokeLinecap="round"
          />
        </svg>
      )}

      {/* Button label and icon */}
      <span className="shiny-cta-content">{children}</span>
    </button>
  );
}
