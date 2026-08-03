"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import Link from "next/link";

/**
 * Shared visual system for /demo and /gate-a2 — the Still Theirs archival
 * identity (v3.1 locked design): warm paper, ink hairlines, zero radius,
 * Newsreader / Archivo / IBM Plex Mono. Colors are read from the --st-*
 * custom properties in globals.css so both product surfaces stay coherent
 * from a single source of truth. Not a general design-system project.
 */

export function ProductShell({
  children,
  wide = false,
  header,
}: {
  children: ReactNode;
  wide?: boolean;
  header?: ReactNode;
}) {
  return (
    <div className="st-product min-h-screen bg-[var(--st-bg)] text-[var(--st-text)]">
      {header}
      <div className={`mx-auto w-full px-4 py-10 sm:px-8 ${wide ? "max-w-[1160px]" : "max-w-2xl"}`}>{children}</div>
    </div>
  );
}

/** The archival wordmark, as a standalone line inside a page body. */
export function ProductBrand() {
  return (
    <p className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-[var(--st-text)]">
      Still <b className="font-medium">Theirs</b>
    </p>
  );
}

/**
 * Full product header — wordmark left, mono session meta right (hidden on
 * small screens), single hairline underneath. Render via ProductShell's
 * `header` slot for a full-bleed rule, or inline for a constrained one.
 */
export function ProductHeader({ meta, padded = true }: { meta?: ReactNode; padded?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between border-b border-[var(--st-border)] py-4 sm:py-5 ${padded ? "px-5 sm:px-10" : ""}`}
    >
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--st-text)]">
        Still <b className="font-medium">Theirs</b>
      </p>
      {meta && (
        <p className="hidden text-right font-mono text-[11px] uppercase leading-snug tracking-[0.04em] text-[var(--st-text-muted)] sm:block">
          {meta}
        </p>
      )}
    </div>
  );
}

/**
 * The spine bar — the core line recurring small and constant under the
 * header on every screen after Selection. A colophon, not a second hero.
 */
export function SpineBar({ padded = true }: { padded?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2.5 border-b border-[var(--st-border)] py-2.5 font-serif text-[12.5px] italic tracking-[0.01em] text-[var(--st-text-secondary)] ${padded ? "px-5 sm:px-10" : ""}`}
    >
      <span aria-hidden="true" className="h-[5px] w-[5px] shrink-0 bg-[var(--st-text-muted)]" />
      The safest payment credential is sometimes the one that was never created.
    </div>
  );
}

/**
 * The Held Line — the 1px boundary between human intent (evidence,
 * explanation, action) and payment authority / credential territory.
 * Draws in once on every screen entry (it remounts with its screen);
 * vertical from lg up, a horizontal rule when stacked.
 */
export function HeldLine({
  label = "Still Theirs",
  className = "",
  orientation = "responsive",
}: {
  label?: string;
  className?: string;
  orientation?: "responsive" | "horizontal";
}) {
  return (
    <div
      aria-hidden="true"
      className={`${orientation === "horizontal" ? "st-held-line-x" : "st-held-line"} ${className}`}
    >
      <span className="st-held-label">{label}</span>
    </div>
  );
}

export type SealVerdict = "held" | "scoped" | "withheld";

/* Border stays the accent color while the text uses its deep variant, so
 * the mark always reads as stamped ink on paper rather than a badge. */
const SEAL_STYLES: Record<SealVerdict, CSSProperties> = {
  held: { borderColor: "var(--st-text)", color: "var(--st-text)" },
  scoped: { borderColor: "var(--st-safe)", color: "var(--st-safe-deep)" },
  withheld: { borderColor: "var(--st-paused)", color: "var(--st-paused-deep)" },
};

/**
 * The Seal — a plain rotated double-ring stamp, the one deliberate circle
 * in the system. Appears only where the system commits to a one-word
 * verdict: Held (analysis), Scoped (approved), Withheld (risky).
 */
export function Seal({
  verdict,
  children,
  className = "",
}: {
  verdict: SealVerdict;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={`st-seal ${className}`} style={SEAL_STYLES[verdict]}>
      {children}
    </span>
  );
}

/**
 * The credential artifact — the recurring "credential territory" object.
 * Dashed ink-faint outline while nothing exists; solid ink outline once a
 * scoped instruction is resolved (locked). Never a filled surface.
 */
export function CredentialArtifact({
  tag,
  locked = false,
  children,
  className = "",
}: {
  tag: string;
  locked?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative border-[1.5px] bg-[var(--st-surface)] p-7 ${
        locked ? "border-solid border-[var(--st-text)]" : "border-dashed border-[var(--st-text-muted)]"
      } ${className}`}
    >
      <span className="absolute -top-[11px] left-6 bg-[var(--st-bg)] px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--st-text-muted)]">
        {tag}
      </span>
      {children}
    </div>
  );
}

export type StatusTone = "safe" | "paused" | "neutral";

const TONE_CLASSES: Record<StatusTone, string> = {
  safe: "border-[var(--st-safe)] bg-[var(--st-safe-tint)] text-[var(--st-safe-deep)]",
  paused: "border-[var(--st-paused)] bg-[var(--st-paused-tint)] text-[var(--st-paused-deep)]",
  neutral: "border-[var(--st-border)] bg-[var(--st-surface)] text-[var(--st-text-secondary)]",
};

const TONE_DOT_CLASSES: Record<StatusTone, string> = {
  safe: "bg-[var(--st-safe)]",
  paused: "bg-[var(--st-paused)]",
  neutral: "bg-[var(--st-text-muted)]",
};

/** Status is always paired with visible text — never conveyed by color alone. */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-2 border px-3 py-2 font-mono text-[11.5px] uppercase tracking-[0.06em] ${TONE_CLASSES[tone]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TONE_DOT_CLASSES[tone]}`} />
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
      className={`border border-[var(--st-border)] bg-[var(--st-surface)] p-6 ${
        emphasis ? "shadow-[2px_2px_0_rgba(27,24,18,0.06)]" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function DefinitionRow({ term, value }: { term: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dotted border-[var(--st-border)] py-2.5 font-mono text-[12.5px] last:border-b-0">
      <dt className="text-[var(--st-text-secondary)]">{term}</dt>
      <dd className="text-right font-medium text-[var(--st-text)]">{value}</dd>
    </div>
  );
}

const ACTION_BASE =
  "inline-flex min-h-[44px] items-center justify-center border px-6 py-3 font-sans text-xs font-semibold uppercase tracking-[0.08em] transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--st-text-muted)] disabled:cursor-not-allowed";

type ActionProps = {
  children: ReactNode;
  href?: string;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function PrimaryAction({ children, href, className = "", ...props }: ActionProps) {
  const classes = `${ACTION_BASE} border-[var(--st-text)] bg-[var(--st-text)] text-[var(--st-bg)] hover:bg-[var(--st-text-secondary)] disabled:bg-transparent disabled:text-[var(--st-text-muted)] ${className}`;
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
  const classes = `${ACTION_BASE} border-[var(--st-border)] bg-transparent text-[var(--st-text)] hover:border-[var(--st-text)] ${className}`;
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
