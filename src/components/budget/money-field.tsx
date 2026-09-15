"use client";

import { useState } from "react";
import { TextField } from "@/components/ui/text-field";
import { formatRupiah, parseRupiah } from "@/lib/money";

/** Rupiah input with a live "as understood" preview, so typos are caught before submitting. */
export function MoneyField({
  label,
  name,
  defaultValue = "",
  errors,
  required,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  errors?: string[] | undefined;
  required?: boolean;
  hint?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const parsed = value.trim() ? parseRupiah(value) : null;

  return (
    <TextField
      label={label}
      name={name}
      inputMode="numeric"
      autoComplete="off"
      placeholder="10.000.000"
      required={required}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      hint={parsed !== null ? `Terbaca: ${formatRupiah(parsed)}` : hint}
      errors={errors}
    />
  );
}
