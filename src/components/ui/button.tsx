import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const VARIANTS = {
  primary: "bg-clay-600 text-white shadow-sm hover:bg-clay-700 disabled:bg-clay-600/60",
  secondary: "border border-cream-300 bg-white text-ink-900 hover:bg-cream-100 disabled:text-ink-500",
  ghost: "text-ink-700 hover:bg-cream-100 disabled:text-ink-500",
  danger: "border border-danger-600/30 bg-white text-danger-600 hover:bg-danger-50",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export function buttonClassName(variant: ButtonVariant = "primary", extra?: string): string {
  return cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-600 disabled:cursor-not-allowed",
    VARIANTS[variant],
    extra,
  );
}

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClassName(variant, className)} {...props} />;
}
