"use client";

import { useId } from "react";

export function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  label,
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  label: string;
  description?: string | null;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-cream-300 bg-white p-4 transition-colors hover:border-clay-300 has-[:checked]:border-clay-600 has-[:checked]:bg-clay-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-clay-600"
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="mt-1 size-4 shrink-0 accent-clay-600"
      />
      <span>
        <span className="block font-medium text-ink-900">{label}</span>
        {description ? <span className="mt-0.5 block text-sm text-ink-500">{description}</span> : null}
      </span>
    </label>
  );
}
