"use client";

import type React from "react";
import { cn } from "@/lib/utils";

interface ShinyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
}

export function ShinyButton({
  children,
  onClick,
  className = "",
  type = "button",
  ...props
}: ShinyButtonProps) {
  return (
    <button
      type={type}
      className={cn("shiny-cta", className)}
      onClick={onClick}
      {...props}
    >
      <span>{children}</span>
    </button>
  );
}
