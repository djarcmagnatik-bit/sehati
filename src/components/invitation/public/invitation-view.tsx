import type { ReactNode } from "react";
import { preload } from "react-dom";
import { CountdownTimer } from "@/components/invitation/public/countdown-timer";
import { CopyValue } from "@/components/invitation/public/copy-value";
import { MusicPlayer } from "@/components/invitation/public/music-player";
import { RsvpForm, type RsvpState } from "@/components/invitation/public/rsvp-form";
import { WishesSection, type PublicWishView } from "@/components/invitation/public/wishes";
import { dbDateToIso, formatIsoDateLong, zonedTimeToUtcMs } from "@/lib/dates";
import { GIFT_ACCOUNT_LABEL, SECTION_LABEL, type InvitationSectionTypeValue } from "@/lib/invitation";
import { getTheme, themeStyle } from "@/lib/invitation-themes";
import { mapEmbedUrl, mapsLink } from "@/lib/maps";
import { instagramUrl } from "@/lib/vendors";
import { mediaPath, mediaSrcSet } from "@/lib/media";
import type { PublicInvitation, PublicSection } from "@/server/invitation/public-invitation-service";

type ViewProps = {
  invitation: PublicInvitation;
  /** Name to address the invitation to; falls back to the invitation's default greeting. */
  guestName?: string | null;
  guestSeatCount?: number | null;
  /** Present only on a personalized link: enables the guest's own RSVP form. */
  rsvp?: RsvpState | null;
  wishes?: PublicWishView[];
  now: Date;
};

function text(section: PublicSection, key: string): string {
  const value = section.content[key];
  return typeof value === "string" ? value : "";
}

function SectionShell({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title?: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="px-5 py-12 sm:py-16">
      <div className="mx-auto w-full max-w-2xl text-center">
        {title ? (
          <h2 className="font-[family-name:var(--inv-display-font)] text-2xl font-semibold sm:text-3xl">{title}</h2>
        ) : null}
        {title ? <div aria-hidden="true" className="mx-auto mt-3 h-px w-32" style={{ background: "var(--inv-ornament)" }} /> : null}
        {intro ? (
          <p className="mx-auto mt-4 max-w-xl text-pretty" style={{ color: "var(--inv-muted)" }}>
            {intro}
          </p>
        ) : null}
        <div className={title || intro ? "mt-8" : undefined}>{children}</div>
      </div>
    </section>
  );
}

function Cover({ invitation, guestName }: { invitation: PublicInvitation; guestName: string | null }) {
  const cover = invitation.sections.find((section) => section.type === "COVER");
  const prefix = cover ? text(cover, "prefix") : "";
  const note = cover ? text(cover, "note") : "";
  const layout = invitation.coverLayout;
  const align = layout === "bottom" ? "justify-end pb-16" : layout === "split" ? "justify-center" : "justify-center";
  const coverSrc = invitation.coverImageId ? mediaPath(invitation.coverImageId, invitation.coverImageWidths.length > 0 ? 960 : undefined) : null;
  const coverSrcSet = invitation.coverImageId ? mediaSrcSet(invitation.coverImageId, invitation.coverImageWidths) : undefined;
  // The cover is the largest paint: start fetching it from <head>, alongside CSS and scripts.
  if (coverSrc) preload(coverSrc, { as: "image", fetchPriority: "high", imageSrcSet: coverSrcSet, imageSizes: "100vw" });

  return (
    <header
      className={`relative flex min-h-[85svh] flex-col ${align} overflow-hidden px-6 py-12 text-center`}
      style={{ background: "var(--inv-accent-soft)", color: invitation.coverImageId ? "var(--inv-cover-ink)" : "var(--inv-ink)" }}
    >
      {invitation.coverImageId ? (
        <>
          {/* Resized WebP copies from /media (made at upload); the browser picks one for the screen. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverSrc!}
            srcSet={coverSrcSet}
            sizes="100vw"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 size-full object-cover"
            fetchPriority="high"
          />
          <div aria-hidden="true" className="absolute inset-0" style={{ background: "var(--inv-cover-overlay)" }} />
        </>
      ) : null}

      <div className={`relative mx-auto w-full ${layout === "split" ? "max-w-3xl sm:text-left" : "max-w-xl"}`}>
        {prefix ? <p className="text-sm tracking-[0.3em] uppercase">{prefix}</p> : null}
        <h1 className="mt-4 font-[family-name:var(--inv-display-font)] text-4xl font-semibold text-balance sm:text-6xl">
          {invitation.coupleName}
        </h1>
        <p className="mt-4 text-lg">
          <time dateTime={invitation.weddingDateIso}>{formatIsoDateLong(invitation.weddingDateIso)}</time>
        </p>
        {note ? <p className="mt-3 text-sm opacity-90">{note}</p> : null}
        {guestName ? (
          <div
            className={`mt-8 inline-block rounded-[var(--inv-radius)] px-6 py-4 ${layout === "split" ? "" : "mx-auto"}`}
            style={{ background: "color-mix(in srgb, var(--inv-surface) 88%, transparent)", color: "var(--inv-ink)" }}
          >
            <p className="text-xs tracking-widest uppercase" style={{ color: "var(--inv-muted)" }}>
              Kepada Yth.
            </p>
            <p className="mt-1 font-[family-name:var(--inv-display-font)] text-xl font-semibold">{guestName}</p>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function CoupleSection({ section }: { section: PublicSection }) {
  const sides = [
    { name: text(section, "brideFullName"), parents: text(section, "brideParents"), instagram: text(section, "brideInstagram") },
    { name: text(section, "groomFullName"), parents: text(section, "groomParents"), instagram: text(section, "groomInstagram") },
  ].filter((side) => side.name);
  if (sides.length === 0) return null;

  return (
    <div className="grid gap-8 sm:grid-cols-2">
      {sides.map((side) => (
        <div key={side.name}>
          <h3 className="font-[family-name:var(--inv-display-font)] text-2xl font-semibold">{side.name}</h3>
          {side.parents ? (
            <p className="mt-2 text-sm text-pretty" style={{ color: "var(--inv-muted)" }}>
              {side.parents}
            </p>
          ) : null}
          {instagramUrl(side.instagram) ? (
            <a
              href={instagramUrl(side.instagram)!}
              rel="noopener noreferrer nofollow"
              target="_blank"
              className="mt-3 inline-block text-sm font-semibold underline underline-offset-4"
              style={{ color: "var(--inv-accent)" }}
            >
              @{side.instagram}
            </a>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function EventList({ invitation }: { invitation: PublicInvitation }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2">
      {invitation.events.map((event) => {
        const link = mapsLink(event);
        const time = [event.startTime, event.endTime].filter(Boolean).join(" – ");
        return (
          <li
            key={event.id}
            className="rounded-[var(--inv-radius)] p-5 text-center"
            style={{ background: "var(--inv-surface)", border: "1px solid var(--inv-border)" }}
          >
            <h3 className="font-[family-name:var(--inv-display-font)] text-xl font-semibold">{event.name}</h3>
            <p className="mt-2 text-sm">
              <time dateTime={dbDateToIso(event.eventDate)}>{formatIsoDateLong(dbDateToIso(event.eventDate))}</time>
            </p>
            {time ? (
              <p className="text-sm" style={{ color: "var(--inv-muted)" }}>
                {time} WIB
              </p>
            ) : null}
            {event.venueName ? <p className="mt-3 font-medium">{event.venueName}</p> : null}
            {event.address ? (
              <p className="mt-1 text-sm text-pretty" style={{ color: "var(--inv-muted)" }}>
                {event.address}
              </p>
            ) : null}
            {event.dressCode ? (
              <p className="mt-3 text-xs tracking-wide uppercase" style={{ color: "var(--inv-muted)" }}>
                Dress code: {event.dressCode}
              </p>
            ) : null}
            {event.notes ? <p className="mt-2 text-sm text-pretty">{event.notes}</p> : null}
            {link ? (
              <a
                href={link}
                rel="noopener noreferrer nofollow"
                target="_blank"
                className="mt-4 inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold"
                style={{ background: "var(--inv-accent)", color: "var(--inv-surface)" }}
              >
                Buka peta
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function LocationSection({ invitation }: { invitation: PublicInvitation }) {
  const event = invitation.events.find((item) => item.latitude !== null && item.longitude !== null) ?? invitation.events[0];
  if (!event) return null;
  const link = mapsLink(event);

  return (
    <div className="space-y-4">
      <p className="font-medium">{event.venueName ?? event.name}</p>
      {event.address ? (
        <p className="text-pretty" style={{ color: "var(--inv-muted)" }}>
          {event.address}
        </p>
      ) : null}
      {event.latitude !== null && event.longitude !== null ? (
        <iframe
          title={`Peta ${event.venueName ?? event.name}`}
          src={mapEmbedUrl(event.latitude, event.longitude)}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="aspect-4/3 w-full rounded-[var(--inv-radius)] border"
          style={{ borderColor: "var(--inv-border)" }}
        />
      ) : null}
      {link ? (
        <a
          href={link}
          rel="noopener noreferrer nofollow"
          target="_blank"
          className="inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold"
          style={{ background: "var(--inv-accent)", color: "var(--inv-surface)" }}
        >
          Petunjuk arah
        </a>
      ) : null}
    </div>
  );
}

function LoveStory({ invitation }: { invitation: PublicInvitation }) {
  if (invitation.loveStory.length === 0) return null;
  return (
    <ol className="space-y-6 text-left">
      {invitation.loveStory.map((entry) => (
        <li key={entry.id} className="border-l-2 pl-5" style={{ borderColor: "var(--inv-accent)" }}>
          {entry.timeLabel ? (
            <p className="text-xs tracking-widest uppercase" style={{ color: "var(--inv-accent)" }}>
              {entry.timeLabel}
            </p>
          ) : null}
          <h3 className="mt-1 font-[family-name:var(--inv-display-font)] text-xl font-semibold">{entry.title}</h3>
          <p className="mt-2 text-pretty whitespace-pre-line" style={{ color: "var(--inv-muted)" }}>
            {entry.story}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Gallery({ invitation }: { invitation: PublicInvitation }) {
  if (invitation.gallery.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {invitation.gallery.map((image) => (
        <li key={image.id} className="overflow-hidden rounded-[var(--inv-radius)]" style={{ background: "var(--inv-accent-soft)" }}>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaPath(image.assetId, image.widths.length > 0 ? 480 : undefined)}
              srcSet={mediaSrcSet(image.assetId, image.widths)}
              sizes="(min-width: 640px) 220px, 50vw"
              alt={image.caption ?? ""}
              width={image.width}
              height={image.height}
              loading="lazy"
              decoding="async"
              className="aspect-square w-full object-cover"
            />
            {image.caption ? (
              <figcaption className="px-2 py-2 text-xs" style={{ color: "var(--inv-muted)" }}>
                {image.caption}
              </figcaption>
            ) : null}
          </figure>
        </li>
      ))}
    </ul>
  );
}

function GiftSection({ invitation }: { invitation: PublicInvitation }) {
  if (invitation.giftAccounts.length === 0 && !invitation.giftAddress) return null;
  return (
    <div className="space-y-4">
      {invitation.giftAccounts.map((account) => (
        <div
          key={account.id}
          className="rounded-[var(--inv-radius)] p-5"
          style={{ background: "var(--inv-surface)", border: "1px solid var(--inv-border)" }}
        >
          <p className="text-xs tracking-widest uppercase" style={{ color: "var(--inv-muted)" }}>
            {GIFT_ACCOUNT_LABEL[account.type]}
          </p>
          <p className="mt-1 text-lg font-semibold">{account.providerName}</p>
          <p className="mt-2 font-mono text-xl tracking-wide">{account.accountNumber}</p>
          <p className="text-sm" style={{ color: "var(--inv-muted)" }}>
            a.n. {account.accountHolder}
          </p>
          {account.notes ? (
            <p className="mt-2 text-sm" style={{ color: "var(--inv-muted)" }}>
              {account.notes}
            </p>
          ) : null}
          <div className="mt-4">
            <CopyValue value={account.accountNumber} label="Salin nomor" />
          </div>
        </div>
      ))}
      {invitation.giftAddress ? (
        <div
          className="rounded-[var(--inv-radius)] p-5"
          style={{ background: "var(--inv-surface)", border: "1px solid var(--inv-border)" }}
        >
          <p className="text-xs tracking-widest uppercase" style={{ color: "var(--inv-muted)" }}>
            Kirim hadiah
          </p>
          <p className="mt-2 text-pretty">{invitation.giftAddress}</p>
          <div className="mt-4">
            <CopyValue value={invitation.giftAddress} label="Salin alamat" />
          </div>
        </div>
      ) : null}
      <p className="text-xs" style={{ color: "var(--inv-muted)" }}>
        Informasi ini hanya ditampilkan untuk memudahkan pengiriman hadiah. Tidak ada pembayaran yang diproses di halaman ini.
      </p>
    </div>
  );
}

/** Renders one section; returns null when it has nothing to show, so empty sections never leave a gap. */
function SectionBody({
  section,
  invitation,
  now,
  rsvp,
  wishes,
}: {
  section: PublicSection;
  invitation: PublicInvitation;
  now: Date;
  rsvp: RsvpState | null;
  wishes: PublicWishView[];
}) {
  const intro = text(section, "intro");
  const type: InvitationSectionTypeValue = section.type;

  switch (type) {
    case "COVER":
      return null;
    case "COUPLE":
      if (!text(section, "brideFullName") && !text(section, "groomFullName")) return null;
      return (
        <SectionShell id="mempelai" title="Mempelai" intro={intro}>
          <CoupleSection section={section} />
        </SectionShell>
      );
    case "QUOTE": {
      const quote = text(section, "text");
      if (!quote) return null;
      return (
        <SectionShell id="kutipan">
          <figure>
            <blockquote className="font-[family-name:var(--inv-display-font)] text-xl text-pretty italic sm:text-2xl">
              “{quote}”
            </blockquote>
            {text(section, "source") ? (
              <figcaption className="mt-4 text-sm" style={{ color: "var(--inv-muted)" }}>
                — {text(section, "source")}
              </figcaption>
            ) : null}
          </figure>
        </SectionShell>
      );
    }
    case "EVENTS":
      if (invitation.events.length === 0) return null;
      return (
        <SectionShell id="acara" title="Acara" intro={intro}>
          <EventList invitation={invitation} />
        </SectionShell>
      );
    case "COUNTDOWN":
      return (
        <SectionShell id="hitung-mundur" title="Menuju hari bahagia">
          <CountdownTimer
            targetMs={zonedTimeToUtcMs(invitation.weddingDateIso, invitation.timeZone, invitation.events[0]?.startTime ?? "00:00")}
            initialNowMs={now.getTime()}
          />
        </SectionShell>
      );
    case "LOVE_STORY":
      if (invitation.loveStory.length === 0) return null;
      return (
        <SectionShell id="cerita" title="Cerita kami" intro={intro}>
          <LoveStory invitation={invitation} />
        </SectionShell>
      );
    case "GALLERY":
      if (invitation.gallery.length === 0) return null;
      return (
        <SectionShell id="galeri" title="Galeri" intro={intro}>
          <Gallery invitation={invitation} />
        </SectionShell>
      );
    case "LOCATION":
      if (invitation.events.length === 0) return null;
      return (
        <SectionShell id="lokasi" title="Lokasi" intro={intro}>
          <LocationSection invitation={invitation} />
        </SectionShell>
      );
    case "RSVP":
      return (
        <SectionShell id="rsvp" title={SECTION_LABEL.RSVP} intro={intro}>
          {rsvp ? (
            <RsvpForm guest={rsvp} />
          ) : (
            <p className="text-pretty" style={{ color: "var(--inv-muted)" }}>
              Konfirmasi kehadiran dilakukan lewat tautan undangan pribadi yang dikirimkan mempelai kepada masing-masing tamu.
            </p>
          )}
        </SectionShell>
      );
    case "WISHES":
      return (
        <SectionShell id="ucapan" title={SECTION_LABEL.WISHES} intro={intro}>
          <WishesSection
            slug={invitation.slug}
            token={rsvp?.token ?? null}
            wishes={wishes}
            defaultName={rsvp?.invitationName ?? null}
          />
        </SectionShell>
      );
    case "GIFT":
      if (invitation.giftAccounts.length === 0 && !invitation.giftAddress) return null;
      return (
        <SectionShell id="hadiah" title="Hadiah" intro={intro}>
          <GiftSection invitation={invitation} />
        </SectionShell>
      );
    case "CLOSING": {
      const message = text(section, "message");
      if (!message) return null;
      return (
        <SectionShell id="penutup">
          <p className="text-pretty">{message}</p>
          {text(section, "signature") ? (
            <p className="mt-6 text-sm" style={{ color: "var(--inv-muted)" }}>
              {text(section, "signature")}
            </p>
          ) : null}
          <p className="mt-2 font-[family-name:var(--inv-display-font)] text-2xl font-semibold">{invitation.coupleName}</p>
        </SectionShell>
      );
    }
  }
}

/** The whole public invitation. Receives only data the public service is allowed to expose. */
export function InvitationView({ invitation, guestName = null, guestSeatCount = null, rsvp = null, wishes = [], now }: ViewProps) {
  const theme = getTheme(invitation.themeCode);
  const greeting = guestName ?? invitation.defaultGuestLabel;

  return (
    <div
      data-theme={theme.code}
      style={{ ...themeStyle(theme), background: "var(--inv-background)", color: "var(--inv-ink)" }}
      className="min-h-dvh font-[family-name:var(--inv-body-font)]"
    >
      <Cover invitation={invitation} guestName={greeting} />
      {guestSeatCount && guestSeatCount > 1 ? (
        <p className="px-5 pt-8 text-center text-sm" style={{ color: "var(--inv-muted)" }}>
          Undangan ini berlaku untuk {guestSeatCount} orang.
        </p>
      ) : null}
      <main>
        {invitation.sections.map((section) => (
          <SectionBody key={section.id} section={section} invitation={invitation} now={now} rsvp={rsvp} wishes={wishes} />
        ))}
      </main>
      {invitation.music ? <MusicPlayer src={mediaPath(invitation.music.assetId)} volume={invitation.music.volume} /> : null}
      <footer className="px-5 pt-4 pb-24 text-center text-xs" style={{ color: "var(--inv-muted)" }}>
        <p>
          {invitation.coupleName} · <time dateTime={invitation.weddingDateIso}>{formatIsoDateLong(invitation.weddingDateIso)}</time>
        </p>
      </footer>
    </div>
  );
}
