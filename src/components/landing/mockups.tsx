import { invitationFontsClassName } from "@/components/invitation/invitation-fonts";
import { formatIsoDateLong, zonedTimeToUtcMs } from "@/lib/dates";
import { getTheme, themeLook } from "@/lib/invitation-themes";
import { mediaPath, mediaSrcSet } from "@/lib/media";
import type { LandingDemo } from "@/server/marketing/landing-service";

/**
 * Decorative previews of the app for the landing page, drawn with HTML instead of screenshots so they
 * stay sharp, light and in step with the design. The sample couple matches the demo account. All of
 * them are aria-hidden: the surrounding text says the same thing.
 */

function Frame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div aria-hidden="true" className={`rounded-[2rem] bg-gradient-to-br from-clay-100 via-cream-100 to-sage-100 p-4 ring-1 ring-cream-200 sm:p-6 ${className}`}>
      <div className="rounded-3xl bg-white/90 p-5 shadow-sm">{children}</div>
    </div>
  );
}

function Bar({ percent, tone = "clay" }: { percent: number; tone?: "clay" | "sage" }) {
  return (
    <div className="h-2 rounded-full bg-cream-100">
      <div className={`h-2 rounded-full ${tone === "clay" ? "bg-clay-600" : "bg-sage-700"}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function DashboardMock() {
  return (
    <Frame>
      <p className="text-sm font-medium text-clay-700">Halo, Rizky</p>
      <p className="mt-1 font-display text-3xl font-semibold">Anisa &amp; Rizky</p>
      <p className="text-sm text-ink-500">Akad &amp; Resepsi · Bandung</p>
      <div className="mt-5 flex items-end gap-3">
        <p className="font-display text-6xl font-semibold leading-none text-clay-700">150</p>
        <p className="pb-1 text-ink-700">hari lagi</p>
      </div>
      <dl className="mt-6 space-y-4 text-sm">
        <div>
          <div className="flex justify-between">
            <dt className="text-ink-700">Checklist</dt>
            <dd className="font-semibold">36 / 91 tugas</dd>
          </div>
          <div className="mt-1.5">
            <Bar percent={40} />
          </div>
        </div>
        <div>
          <div className="flex justify-between">
            <dt className="text-ink-700">Anggaran terbayar</dt>
            <dd className="font-semibold">Rp64 jt / Rp150 jt</dd>
          </div>
          <div className="mt-1.5">
            <Bar percent={43} tone="sage" />
          </div>
        </div>
        <div className="flex justify-between rounded-2xl bg-cream-50 px-3 py-2">
          <dt className="text-ink-700">Tamu konfirmasi hadir</dt>
          <dd className="font-semibold">38 orang</dd>
        </div>
      </dl>
    </Frame>
  );
}

export function TogetherMock() {
  const activity = [
    ["A", "Anisa", "menandai “Booking gedung” selesai", "clay"],
    ["R", "Rizky", "mencatat DP catering Rp20.000.000", "sage"],
    ["A", "Anisa", "menambahkan 12 tamu keluarga", "clay"],
    ["R", "Rizky", "memilih Lensa Cerita Studio", "sage"],
  ] as const;
  return (
    <Frame>
      <div className="rounded-2xl bg-clay-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-clay-700">Catatan berdua</p>
        <p className="mt-1 text-sm text-ink-700">Fitting kebaya Sabtu jam 10, bawa sepatu. Konfirmasi kursi ke catering H-14.</p>
      </div>
      <p className="mt-5 text-sm font-semibold text-ink-900">Aktivitas terbaru</p>
      <ul className="mt-3 space-y-3">
        {activity.map(([initial, name, text, tone], index) => (
          <li key={index} className="flex items-start gap-3 text-sm">
            <span className={`grid size-8 shrink-0 place-items-center rounded-full font-semibold text-white ${tone === "clay" ? "bg-clay-600" : "bg-sage-700"}`}>{initial}</span>
            <p className="pt-1 text-ink-700">
              <span className="font-semibold text-ink-900">{name}</span> {text}
            </p>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function ChecklistMock() {
  const tasks = [
    ["Booking gedung resepsi", "Venue", true],
    ["Daftar nikah ke KUA", "Administrasi", true],
    ["Food tasting catering", "Catering", false],
    ["Fitting busana pengantin", "Busana", false],
    ["Kirim undangan digital", "Undangan", false],
  ] as const;
  return (
    <Frame>
      <div className="flex items-center justify-between">
        <p className="font-semibold">Checklist</p>
        <p className="text-sm text-ink-500">40% selesai</p>
      </div>
      <div className="mt-2">
        <Bar percent={40} />
      </div>
      <ul className="mt-4 space-y-2.5">
        {tasks.map(([title, category, done]) => (
          <li key={title} className="flex items-center gap-3 rounded-2xl border border-cream-200 px-3 py-2.5 text-sm">
            <span className={`grid size-5 shrink-0 place-items-center rounded-md border ${done ? "border-sage-700 bg-sage-700 text-white" : "border-cream-300"}`}>
              {done ? "✓" : ""}
            </span>
            <span className={`flex-1 ${done ? "text-ink-500 line-through" : "text-ink-900"}`}>{title}</span>
            <span className="rounded-full bg-cream-100 px-2 py-0.5 text-xs text-ink-700">{category}</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function BudgetMock() {
  const rows = [
    ["Catering", 40, 50],
    ["Venue", 35, 43],
    ["Dekorasi", 15, 33],
    ["Fotografi", 12, 100],
  ] as const;
  return (
    <Frame>
      <p className="text-sm text-ink-500">Target anggaran</p>
      <p className="font-display text-3xl font-semibold">Rp150.000.000</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-2xl bg-sage-50 p-3">
          <p className="text-ink-500">Sudah dibayar</p>
          <p className="font-semibold text-sage-700">Rp64 jt</p>
        </div>
        <div className="rounded-2xl bg-clay-50 p-3">
          <p className="text-ink-500">Sisa tagihan</p>
          <p className="font-semibold text-clay-700">Rp55,5 jt</p>
        </div>
      </div>
      <ul className="mt-4 space-y-3 text-sm">
        {rows.map(([name, amount, paid]) => (
          <li key={name}>
            <div className="flex justify-between">
              <span className="text-ink-700">{name}</span>
              <span className="font-medium">Rp{amount} jt · {paid}% lunas</span>
            </div>
            <div className="mt-1">
              <Bar percent={paid} tone="sage" />
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function VendorMock() {
  const candidates = [
    ["Sinema Rasa Films", "Rp9 jt", 5, "Terpilih"],
    ["Kilau Video", "Rp7 jt", 4, "Meeting"],
  ] as const;
  return (
    <Frame>
      <p className="font-semibold">Bandingkan videografer</p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        {candidates.map(([name, price, stars, status]) => (
          <div key={name} className={`rounded-2xl border p-3 ${status === "Terpilih" ? "border-sage-700 bg-sage-50" : "border-cream-200"}`}>
            <p className="font-semibold leading-snug">{name}</p>
            <p className="mt-1 text-clay-700">{"★".repeat(stars)}<span className="text-cream-300">{"★".repeat(5 - stars)}</span></p>
            <p className="mt-2 font-medium">{price}</p>
            <p className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs ${status === "Terpilih" ? "bg-sage-700 text-white" : "bg-cream-100 text-ink-700"}`}>{status}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-2xl bg-cream-50 px-3 py-2 text-sm text-ink-700">Setelah dipilih: kontrak, DP, dan pelunasan langsung tercatat di anggaran.</p>
    </Frame>
  );
}

export function GuestMock() {
  const counts = [
    ["Hadir", "38", "bg-sage-50 text-sage-700"],
    ["Mungkin", "3", "bg-cream-100 text-ink-700"],
    ["Tidak", "2", "bg-clay-50 text-clay-700"],
    ["Belum", "8", "bg-white text-ink-500 ring-1 ring-cream-200"],
  ] as const;
  const guests = [
    ["Keluarga Pak Harun", "Hadir · 4 orang"],
    ["Alumni SMA 3", "Mungkin"],
    ["Pak RT Sutrisno", "Hadir · 2 orang"],
  ] as const;
  return (
    <Frame>
      <p className="font-semibold">Tamu &amp; RSVP</p>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
        {counts.map(([label, value, tone]) => (
          <div key={label} className={`rounded-2xl p-2 ${tone}`}>
            <p className="font-display text-xl font-semibold">{value}</p>
            <p>{label}</p>
          </div>
        ))}
      </div>
      <ul className="mt-4 divide-y divide-cream-200 text-sm">
        {guests.map(([name, status]) => (
          <li key={name} className="flex justify-between py-2.5">
            <span>{name}</span>
            <span className="text-ink-500">{status}</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

/** The countdown as it stands when the page is rendered (Jakarta midnight of the wedding day). */
function countdownParts(weddingDateIso: string | null): string[] {
  if (!weddingDateIso) return ["150 hari", "06 jam", "47 menit", "22 detik"];
  const left = Math.max(0, zonedTimeToUtcMs(weddingDateIso, "Asia/Jakarta", "00:00") - Date.now());
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${Math.floor(left / 86_400_000)} hari`,
    `${pad(Math.floor(left / 3_600_000) % 24)} jam`,
    `${pad(Math.floor(left / 60_000) % 60)} menit`,
    `${pad(Math.floor(left / 1000) % 60)} detik`,
  ];
}

/**
 * The phone preview in the invitation section. With the operator's example invitation it shows that
 * invitation's real cover photo, names, date and theme; otherwise a drawn stand-in.
 */
export function InvitationMock({ demo }: { demo?: LandingDemo | null }) {
  const theme = demo ? getTheme(demo.themeCode) : null;
  const look = theme ? themeLook(theme) : null;
  const cover = demo?.coverImageId
    ? {
        src: mediaPath(demo.coverImageId, demo.coverImageWidths.length > 0 ? 480 : undefined),
        srcSet: mediaSrcSet(demo.coverImageId, demo.coverImageWidths),
      }
    : null;
  const nameStyle = theme && look
    ? { fontFamily: theme.tokens.displayFont, fontWeight: look.headingWeight, fontStyle: look.headingStyle }
    : undefined;

  return (
    <div aria-hidden="true" className={`mx-auto w-full max-w-xs rounded-[2.5rem] bg-ink-900 p-2.5 shadow-xl ${invitationFontsClassName}`}>
      <div className="overflow-hidden rounded-[2rem] bg-cream-50">
        <div
          className={`relative px-5 pb-8 pt-12 text-center text-white ${cover ? "" : "bg-gradient-to-b from-clay-300 to-clay-600"}`}
          style={theme && !cover ? { background: theme.tokens.accentSoft, color: theme.tokens.ink } : undefined}
        >
          {cover ? (
            <>
              {/* Served by /media, public only while the example invitation is published. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover.src}
                srcSet={cover.srcSet}
                sizes="320px"
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 size-full object-cover"
              />
              <div className="absolute inset-0" style={{ background: theme?.tokens.coverOverlay ?? "rgba(0,0,0,0.45)" }} />
            </>
          ) : null}
          <div className="relative" style={theme && cover ? { color: theme.tokens.coverInk } : undefined}>
            <p className="text-[0.65rem] uppercase tracking-[0.3em]">The Wedding Of</p>
            <p className="mt-2 font-display text-3xl font-semibold text-balance" style={nameStyle}>
              {demo?.coupleName ?? "Anisa & Rizky"}
            </p>
            <p className="mt-1 text-sm">{demo ? formatIsoDateLong(demo.weddingDateIso) : "Selasa, 16 Februari 2027"}</p>
            <div className="mx-auto mt-6 w-fit rounded-2xl bg-white/90 px-5 py-2 text-ink-900">
              <p className="text-[0.6rem] uppercase tracking-widest text-ink-500">Kepada Yth.</p>
              <p className="font-display text-base font-semibold" style={nameStyle}>
                Bapak Hendra Wijaya
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-3 px-5 py-5 text-center">
          <div className="grid grid-cols-4 gap-1.5 text-[0.65rem]">
            {countdownParts(demo?.weddingDateIso ?? null).map((part) => (
              <span key={part} className="rounded-lg bg-clay-50 py-1.5 text-clay-700">{part}</span>
            ))}
          </div>
          <div className="rounded-2xl border border-cream-200 p-3 text-left text-xs">
            <p className="font-semibold">Konfirmasi kehadiran</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              <span className="rounded-lg bg-sage-700 py-1 text-white">Hadir</span>
              <span className="rounded-lg bg-cream-100 py-1">Mungkin</span>
              <span className="rounded-lg bg-cream-100 py-1">Tidak</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
