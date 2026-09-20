"use client";

import { useActionState, useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { cn } from "@/lib/cn";
import { initialFormState, type FormState } from "@/lib/form-state";
import { slugify } from "@/lib/invitation";
import { ThemeMotifMark } from "@/components/invitation/public/theme-motif";
import { COVER_LAYOUT_LABEL, COVER_LAYOUTS, type CoverLayout, type ThemeMotif } from "@/lib/invitation-themes";
import { IMAGE_MAX_BYTES, IMAGE_MIME_TYPES } from "@/lib/media";
import {
  updateGiftAddressAction,
  updateInvitationSettingsAction,
  updateInvitationThemeAction,
  uploadCoverImageAction,
  uploadGalleryImageAction,
} from "@/server/actions/invitation-actions";

function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>;
}

export function InvitationSettingsForm({
  weddingId,
  slug,
  defaultGuestLabel,
  publicOrigin,
}: {
  weddingId: string;
  slug: string;
  defaultGuestLabel: string;
  publicOrigin: string;
}) {
  const [state, formAction] = useActionState(updateInvitationSettingsAction, initialFormState);
  const [draftSlug, setDraftSlug] = useState(state.values?.slug ?? slug);

  return (
    <form action={formAction} noValidate className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="weddingId" value={weddingId} />
      <TextField
        label="Alamat undangan"
        name="slug"
        required
        maxLength={60}
        value={draftSlug}
        onChange={(event) => setDraftSlug(event.target.value)}
        onBlur={(event) => setDraftSlug(slugify(event.target.value))}
        hint={`${publicOrigin}/undangan/${slugify(draftSlug) || "…"}`}
        errors={state.fieldErrors?.slug}
      />
      <TextField
        label="Sapaan tamu bawaan"
        name="defaultGuestLabel"
        maxLength={120}
        placeholder="Bapak/Ibu/Saudara/i"
        hint="Dipakai saat tautan dibuka tanpa nama tamu."
        defaultValue={state.values?.defaultGuestLabel ?? defaultGuestLabel}
        errors={state.fieldErrors?.defaultGuestLabel}
      />
      <SubmitButton pendingLabel="Menyimpan…">Simpan pengaturan</SubmitButton>
    </form>
  );
}

export type ThemeOption = {
  code: string;
  name: string;
  description: string;
  swatches: string[];
  isPremium: boolean;
  /** Premium and the wedding lacks the premium themes feature. */
  locked: boolean;
  /** What the mini preview needs to show the theme's character, not only its colors. */
  preview: {
    background: string;
    ink: string;
    accent: string;
    ornament: string;
    displayFont: string;
    headingWeight: number;
    headingStyle: "normal" | "italic";
    motif: ThemeMotif;
  };
};

/** A small cover-like sample: the couple's names in the theme's font, weight, colors and motif. */
function ThemePreview({ preview }: { preview: ThemeOption["preview"] }) {
  const variables = {
    "--inv-accent": preview.accent,
    "--inv-ornament": preview.ornament,
    "--inv-background": preview.background,
  } as React.CSSProperties;
  return (
    <span
      aria-hidden="true"
      className="mt-3 flex h-20 flex-col items-center justify-center gap-1 rounded-xl ring-1 ring-black/10"
      style={{ ...variables, background: preview.background, color: preview.ink }}
    >
      <ThemeMotifMark motif={preview.motif} className="h-4 w-20" />
      <span
        className="text-2xl leading-none"
        style={{ fontFamily: preview.displayFont, fontWeight: preview.headingWeight, fontStyle: preview.headingStyle }}
      >
        Anisa &amp; Rizky
      </span>
    </span>
  );
}

export function ThemePicker({
  weddingId,
  themeCode,
  coverLayout,
  openingCover,
  themes,
}: {
  weddingId: string;
  themeCode: string;
  coverLayout: CoverLayout;
  openingCover: boolean;
  themes: ThemeOption[];
}) {
  const [state, formAction] = useActionState(updateInvitationThemeAction, initialFormState);
  const [selected, setSelected] = useState(themeCode);

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage state={state} />
      <input type="hidden" name="weddingId" value={weddingId} />

      <fieldset>
        <legend className="text-sm font-medium text-ink-900">Tema</legend>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((theme) => {
            const active = selected === theme.code;
            return (
              <li key={theme.code}>
                <label
                  className={cn(
                    "flex h-full cursor-pointer gap-3 rounded-2xl border p-3 transition-colors",
                    active ? "border-clay-600 bg-clay-50" : "border-cream-300 bg-white hover:bg-cream-100",
                  )}
                >
                  <input
                    type="radio"
                    name="themeCode"
                    value={theme.code}
                    checked={active}
                    disabled={theme.locked}
                    onChange={() => setSelected(theme.code)}
                    className="mt-1 size-4 accent-clay-600"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {theme.name}
                      {theme.isPremium ? (
                        <span className="ml-2 rounded-full bg-clay-50 px-2 py-0.5 text-xs font-semibold text-clay-700">
                          {theme.locked ? "🔒 Premium" : "Premium"}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-500">{theme.description}</span>
                    <ThemePreview preview={theme.preview} />
                    <span aria-hidden="true" className="mt-2 flex gap-1">
                      {theme.swatches.map((color) => (
                        <span key={color} className="size-5 rounded-full ring-1 ring-black/10" style={{ background: color }} />
                      ))}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-ink-900">Tata letak sampul</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {COVER_LAYOUTS.map((layout) => (
            <label
              key={layout}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-cream-300 bg-white px-4 text-sm has-checked:border-clay-600 has-checked:bg-clay-50"
            >
              <input type="radio" name="coverLayout" value={layout} defaultChecked={coverLayout === layout} className="size-4 accent-clay-600" />
              {COVER_LAYOUT_LABEL[layout]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-cream-300 bg-white p-3">
        <input type="checkbox" name="openingCover" defaultChecked={openingCover} className="mt-1 size-4 accent-clay-600" />
        <span>
          <span className="block font-medium">Tampilkan sampul pembuka</span>
          <span className="mt-0.5 block text-xs text-ink-500">
            Tamu melihat sampul dengan tombol &ldquo;Buka Undangan&rdquo; lebih dulu. Musik latar mulai saat undangan dibuka.
          </span>
        </span>
      </label>

      <SubmitButton pendingLabel="Menyimpan…">Simpan tampilan</SubmitButton>
    </form>
  );
}

const ACCEPT = IMAGE_MIME_TYPES.join(",");

function ImageUploadForm({
  weddingId,
  action,
  label,
  hint,
  submitLabel,
}: {
  weddingId: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  label: string;
  hint: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const inputId = useId();

  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="weddingId" value={weddingId} />
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-900">
          {label}
        </label>
        <input
          id={inputId}
          type="file"
          name="file"
          required
          accept={ACCEPT}
          className="block w-full rounded-xl border border-cream-300 bg-white p-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-clay-50 file:px-4 file:py-2 file:font-semibold file:text-clay-700"
        />
        <p className="text-xs text-ink-500">
          {hint} JPG, PNG, atau WebP, maksimal {Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB.
        </p>
      </div>
      <SubmitButton pendingLabel="Mengunggah…">{submitLabel}</SubmitButton>
    </form>
  );
}

export function CoverUploadForm({ weddingId }: { weddingId: string }) {
  return (
    <ImageUploadForm
      weddingId={weddingId}
      action={uploadCoverImageAction}
      label="Foto sampul"
      hint="Foto tegak (portrait) paling pas untuk layar ponsel."
      submitLabel="Unggah sampul"
    />
  );
}

export function GalleryUploadForm({ weddingId }: { weddingId: string }) {
  return (
    <ImageUploadForm
      weddingId={weddingId}
      action={uploadGalleryImageAction}
      label="Tambah foto galeri"
      hint="Foto akan ditampilkan dalam kotak persegi."
      submitLabel="Unggah foto"
    />
  );
}

export function GiftAddressForm({ weddingId, giftAddress }: { weddingId: string; giftAddress: string }) {
  const [state, formAction] = useActionState(updateGiftAddressAction, initialFormState);
  return (
    <form action={formAction} noValidate className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="weddingId" value={weddingId} />
      <TextareaField
        label="Alamat kirim hadiah"
        name="giftAddress"
        rows={3}
        maxLength={500}
        hint="Kosongkan bila tidak ingin menampilkan alamat."
        defaultValue={state.values?.giftAddress ?? giftAddress}
        errors={state.fieldErrors?.giftAddress}
      />
      <SubmitButton pendingLabel="Menyimpan…">Simpan alamat</SubmitButton>
    </form>
  );
}
