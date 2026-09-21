"use client";

import { useActionState, useId, useState } from "react";
import { MAX_SEATS_PER_INVITATION, seatLimit } from "@/lib/guests";
import { initialFormState } from "@/lib/form-state";
import { describeRsvp, RSVP_CHOICE_HINT, RSVP_CHOICE_LABEL, RSVP_CHOICES, type RsvpChoice } from "@/lib/rsvp";
import type { GuestRsvpStatusValue } from "@/lib/guests";
import { submitRsvpAction } from "@/server/actions/public-actions";

const FIELD_CLASS =
  "block min-h-11 w-full rounded-[var(--inv-radius)] border px-3 text-base";

export type RsvpState = {
  token: string;
  invitationName: string;
  seatCount: number | null;
  rsvpStatus: GuestRsvpStatusValue;
  attendingCount: number;
  attendeeNames: string | null;
  message: string | null;
};

/** The guest's own RSVP form on their personalized invitation. */
export function RsvpForm({ guest }: { guest: RsvpState }) {
  const [state, formAction] = useActionState(submitRsvpAction, initialFormState);
  const initialChoice: RsvpChoice = guest.rsvpStatus === "PENDING" ? "ATTENDING" : guest.rsvpStatus;
  const [choice, setChoice] = useState<RsvpChoice>((state.values?.rsvpStatus as RsvpChoice) ?? initialChoice);
  const countId = useId();
  const namesId = useId();
  const messageId = useId();
  const answered = guest.rsvpStatus !== "PENDING";
  const countsPeople = choice !== "DECLINED";
  const defaultCount = guest.attendingCount > 0 ? guest.attendingCount : 1;

  // noValidate: the seat limit is a server rule, so the guest sees our wording, not the browser's.
  return (
    <form action={formAction} noValidate className="mx-auto max-w-md space-y-5 text-left">
      <input type="hidden" name="token" value={guest.token} />

      {state.message ? (
        <p
          role="status"
          className="rounded-[var(--inv-radius)] px-4 py-3 text-sm"
          style={{
            background: "var(--inv-accent-soft)",
            color: state.status === "error" ? "var(--inv-ink)" : "var(--inv-ink)",
            border: "1px solid var(--inv-border)",
          }}
        >
          {state.message}
        </p>
      ) : answered ? (
        <p className="text-sm" style={{ color: "var(--inv-muted)" }}>
          {describeRsvp(guest.rsvpStatus, guest.attendingCount)} Kamu masih bisa mengubah jawabannya.
        </p>
      ) : null}

      <fieldset>
        <legend className="text-sm font-medium">Apakah kamu bisa hadir?</legend>
        <div className="mt-3 space-y-2">
          {RSVP_CHOICES.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-start gap-3 rounded-[var(--inv-radius)] px-4 py-3"
              style={{
                background: choice === option ? "var(--inv-accent-soft)" : "var(--inv-surface)",
                border: `1px solid ${choice === option ? "var(--inv-accent)" : "var(--inv-border)"}`,
              }}
            >
              <input
                type="radio"
                name="rsvpStatus"
                value={option}
                checked={choice === option}
                onChange={() => setChoice(option)}
                className="mt-1 size-4"
                style={{ accentColor: "var(--inv-accent)" }}
              />
              <span>
                <span className="block font-medium">{RSVP_CHOICE_LABEL[option]}</span>
                <span className="block text-xs" style={{ color: "var(--inv-muted)" }}>
                  {RSVP_CHOICE_HINT[option]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {countsPeople ? (
        <div className="space-y-1.5">
          <label htmlFor={countId} className="block text-sm font-medium">
            Berapa orang yang hadir?
          </label>
          <input
            id={countId}
            type="number"
            name="attendingCount"
            inputMode="numeric"
            min={choice === "ATTENDING" ? 1 : 0}
            max={Math.min(seatLimit(guest.seatCount), MAX_SEATS_PER_INVITATION)}
            defaultValue={state.values?.attendingCount ?? String(defaultCount)}
            className={FIELD_CLASS}
            style={{ background: "var(--inv-surface)", borderColor: "var(--inv-border)", color: "var(--inv-ink)" }}
          />
          {guest.seatCount !== null ? (
            <p className="text-xs" style={{ color: "var(--inv-muted)" }}>
              Undangan ini berlaku untuk {guest.seatCount} orang.
            </p>
          ) : null}
          {state.fieldErrors?.attendingCount?.[0] ? (
            <p className="text-xs font-medium" style={{ color: "var(--inv-accent)" }}>
              {state.fieldErrors.attendingCount[0]}
            </p>
          ) : null}
        </div>
      ) : (
        <input type="hidden" name="attendingCount" value="0" />
      )}

      {countsPeople ? (
        <div className="space-y-1.5">
          <label htmlFor={namesId} className="block text-sm font-medium">
            Nama yang hadir <span style={{ color: "var(--inv-muted)" }}>(opsional)</span>
          </label>
          <textarea
            id={namesId}
            name="attendeeNames"
            rows={2}
            maxLength={500}
            defaultValue={state.values?.attendeeNames ?? guest.attendeeNames ?? ""}
            className="block w-full rounded-[var(--inv-radius)] border p-3 text-base"
            style={{ background: "var(--inv-surface)", borderColor: "var(--inv-border)", color: "var(--inv-ink)" }}
          />
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor={messageId} className="block text-sm font-medium">
          Pesan untuk mempelai <span style={{ color: "var(--inv-muted)" }}>(opsional)</span>
        </label>
        <textarea
          id={messageId}
          name="message"
          rows={3}
          maxLength={1000}
          defaultValue={state.values?.message ?? guest.message ?? ""}
          className="block w-full rounded-[var(--inv-radius)] border p-3 text-base"
          style={{ background: "var(--inv-surface)", borderColor: "var(--inv-border)", color: "var(--inv-ink)" }}
        />
      </div>

      <button
        type="submit"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full px-6 font-semibold"
        style={{ background: "var(--inv-accent)", color: "var(--inv-surface)" }}
      >
        {answered ? "Perbarui konfirmasi" : "Kirim konfirmasi"}
      </button>
    </form>
  );
}
