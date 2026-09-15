"use client";

import { useId, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { FieldError } from "./field-error";

type TextareaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  name: string;
  errors?: string[] | undefined;
  hint?: string;
};

export function TextareaField({ label, name, errors, hint, id, className, ...textareaProps }: TextareaFieldProps) {
  const generatedId = useId();
  const textareaId = id ?? `${name}-${generatedId}`;
  const hintId = hint ? `${textareaId}-hint` : undefined;
  const errorMessage = errors?.[0];
  const errorId = errorMessage ? `${textareaId}-error` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={textareaId} className="block text-sm font-medium text-ink-900">
        {label}
      </label>
      <textarea
        id={textareaId}
        name={name}
        aria-invalid={errorId ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={cn(
          "block w-full rounded-xl border bg-white px-3.5 py-2.5 text-base text-ink-900 placeholder:text-ink-500/70",
          "focus:outline-2 focus:outline-offset-1 focus:outline-clay-600",
          errorId ? "border-danger-600" : "border-cream-300",
        )}
        {...textareaProps}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
      {errorId ? <FieldError id={errorId} message={errorMessage} /> : null}
    </div>
  );
}
