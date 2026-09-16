"use client";

import { useActionState, useId } from "react";
import { initialFormState } from "@/lib/form-state";
import { WISH_MESSAGE_MAX, WISH_NAME_MAX } from "@/lib/rsvp";
import { submitWishAction } from "@/server/actions/public-actions";

export type PublicWishView = { id: string; name: string; message: string; createdAtIso: string; timeLabel: string };

export function WishesSection({
  slug,
  token,
  wishes,
  defaultName,
}: {
  slug: string;
  token?: string | null;
  wishes: PublicWishView[];
  defaultName?: string | null;
}) {
  const [state, formAction] = useActionState(submitWishAction, initialFormState);
  const nameId = useId();
  const messageId = useId();
  const sent = state.status === "success";

  return (
    <div className="space-y-8 text-left">
      <form
        key={sent ? `sent-${state.message}` : "form"}
        action={formAction}
        noValidate
        className="mx-auto max-w-md space-y-4"
      >
        <input type="hidden" name="slug" value={slug} />
        {token ? <input type="hidden" name="token" value={token} /> : null}

        {state.message ? (
          <p
            role="status"
            className="rounded-[var(--inv-radius)] px-4 py-3 text-sm"
            style={{ background: "var(--inv-accent-soft)", border: "1px solid var(--inv-border)" }}
          >
            {state.message}
          </p>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor={nameId} className="block text-sm font-medium">
            Nama
          </label>
          <input
            id={nameId}
            name="name"
            required
            maxLength={WISH_NAME_MAX}
            defaultValue={sent ? (defaultName ?? "") : (state.values?.name ?? defaultName ?? "")}
            className="block min-h-11 w-full rounded-[var(--inv-radius)] border px-3 text-base"
            style={{ background: "var(--inv-surface)", borderColor: "var(--inv-border)", color: "var(--inv-ink)" }}
          />
          {state.fieldErrors?.name?.[0] ? (
            <p className="text-xs font-medium" style={{ color: "var(--inv-accent)" }}>
              {state.fieldErrors.name[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor={messageId} className="block text-sm font-medium">
            Ucapan & doa
          </label>
          <textarea
            id={messageId}
            name="message"
            required
            rows={4}
            maxLength={WISH_MESSAGE_MAX}
            defaultValue={sent ? "" : (state.values?.message ?? "")}
            className="block w-full rounded-[var(--inv-radius)] border p-3 text-base"
            style={{ background: "var(--inv-surface)", borderColor: "var(--inv-border)", color: "var(--inv-ink)" }}
          />
          {state.fieldErrors?.message?.[0] ? (
            <p className="text-xs font-medium" style={{ color: "var(--inv-accent)" }}>
              {state.fieldErrors.message[0]}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full px-6 font-semibold"
          style={{ background: "var(--inv-accent)", color: "var(--inv-surface)" }}
        >
          Kirim ucapan
        </button>
      </form>

      {wishes.length > 0 ? (
        <ul className="mx-auto max-w-xl space-y-3">
          {wishes.map((wish) => (
            <li
              key={wish.id}
              className="rounded-[var(--inv-radius)] px-4 py-3"
              style={{ background: "var(--inv-surface)", border: "1px solid var(--inv-border)" }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{wish.name}</p>
                <time dateTime={wish.createdAtIso} className="text-xs" style={{ color: "var(--inv-muted)" }}>
                  {wish.timeLabel}
                </time>
              </div>
              <p className="mt-1 text-sm whitespace-pre-line" style={{ color: "var(--inv-muted)" }}>
                {wish.message}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-center text-sm" style={{ color: "var(--inv-muted)" }}>
          Jadilah yang pertama mengirim ucapan.
        </p>
      )}
    </div>
  );
}
