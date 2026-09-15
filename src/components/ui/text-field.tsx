"use client";

import { useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { FieldError } from "./field-error";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  errors?: string[] | undefined;
  hint?: string;
};

export function TextField({ label, name, errors, hint, id, className, required, ...inputProps }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? `${name}-${generatedId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorMessage = errors?.[0];
  const errorId = errorMessage ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={inputId} className="block text-sm font-medium text-ink-900">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-clay-600">
            {" "}
            *
          </span>
        ) : null}
      </label>
      <input
        id={inputId}
        name={name}
        required={required}
        aria-invalid={errorId ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "block min-h-11 w-full rounded-xl border bg-white px-3.5 text-base text-ink-900 placeholder:text-ink-500/70",
          "focus:outline-2 focus:outline-offset-1 focus:outline-clay-600",
          errorId ? "border-danger-600" : "border-cream-300",
        )}
        {...inputProps}
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
