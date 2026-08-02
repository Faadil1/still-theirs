"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

/**
 * Minimal shared visual system for /demo and /gate-a2 — not a general
 * design-system project. Colors are read from CSS custom properties
 * defined in globals.css (--st-*), so light/dark stay coherent from a
 * single source of truth.
 */

export function ProductShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-[var(--st-bg)] px-4 py-10 text-[var(--st-text)] sm:px-8">
      <div className={`mx-auto w-full ${wide ? "max-w-[1100px]" : "max-w-2xl"}`}>{children}</div>
    </div>
  );
}

export function ProductBrand() {
  return (
    <p className="mb-2 font-sans text-xs font-medium uppercase tracking-[0.2em] text-[var(--st-text-muted)]">
      Still Theirs
    </p>
  );
}

export type StatusTone = "safe" | "paused" | "neutral";

const TONE_CLASSES: Record<StatusTone, string> = {
  safe: "border-[var(--st-safe)]/30 bg-[var(--st-safe)]/10 text-[var(--st-safe)]",
  paused: "border-[var(--st-paused)]/30 bg-[var(--st-paused)]/10 text-[var(--st-paused)]",
  neutral: "border-[var(--st-border)] bg-[var(--st-surface)] text-[var(--st-text-secondary)]",
};

/** Status is always paired with visible text — never conveyed by color alone. */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function SurfaceCard({
  children,
  emphasis = false,
  className = "",
}: {
  children: ReactNode;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--st-border)] bg-[var(--st-surface)] p-6 transition-shadow duration-200 ${
        emphasis ? "shadow-[0_2px_14px_rgba(28,26,23,0.07)]" : "shadow-[0_1px_2px_rgba(28,26,23,0.04)]"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function DefinitionRow({ term, value }: { term: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 font-sans text-sm">
      <dt className="text-[var(--st-text-secondary)]">{term}</dt>
      <dd className="text-right font-medium text-[var(--st-text)]">{value}</dd>
    </div>
  );
}

const ACTION_BASE =
  "inline-flex min-h-[44px] items-center justify-center rounded-full px-6 py-2.5 font-sans text-sm font-medium transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--st-text-muted)] disabled:cursor-not-allowed disabled:opacity-40";

type ActionProps = {
  children: ReactNode;
  href?: string;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function PrimaryAction({ children, href, className = "", ...props }: ActionProps) {
  const classes = `${ACTION_BASE} bg-[var(--st-text)] text-[var(--st-surface)] hover:opacity-90 ${className}`;
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

export function SecondaryAction({ children, href, className = "", ...props }: ActionProps) {
  const classes = `${ACTION_BASE} border border-[var(--st-border)] bg-transparent text-[var(--st-text)] hover:border-[var(--st-text-muted)] ${className}`;
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
