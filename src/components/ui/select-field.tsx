"use client";

import { useId, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { FieldError } from "./field-error";

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  name: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  errors?: string[] | undefined;
  hint?: string;
};

export function SelectField({ label, name, options, errors, hint, id, className, required, ...selectProps }: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? `${name}-${generatedId}`;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorMessage = errors?.[0];
  const errorId = errorMessage ? `${selectId}-error` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={selectId} className="block text-sm font-medium text-ink-900">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-clay-600">
            {" "}
            *
          </span>
        ) : null}
      </label>
      <select
        id={selectId}
        name={name}
        required={required}
        aria-invalid={errorId ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={cn(
          "block min-h-11 w-full rounded-xl border bg-white px-3 text-base text-ink-900",
          "focus:outline-2 focus:outline-offset-1 focus:outline-clay-600",
          errorId ? "border-danger-600" : "border-cream-300",
        )}
        {...selectProps}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={hintId} className="text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
      {errorId ? <FieldError id={errorId} message={errorMessage} /> : null}
    </div>
  );
}
