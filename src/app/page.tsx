import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { BudgetMock, ChecklistMock, DashboardMock, GuestMock, InvitationMock, TogetherMock, VendorMock } from "@/components/landing/mockups";
import { buttonClassName } from "@/components/ui/button";
import { FEATURE_LABEL } from "@/lib/billing";
import { INVITATION_THEMES } from "@/lib/invitation-themes";
import { formatRupiah } from "@/lib/money";
import { SITE } from "@/lib/site";
import { MAX_COUPLE_MEMBERS } from "@/server/collaboration/partner-invitation-service";
import { getLandingData } from "@/server/marketing/landing-service";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const NAV = [
  ["#fitur", "Fitur"],
  ["#undangan", "Undangan"],
  ["#harga", "Harga"],
  ["#faq", "FAQ"],
] as const;

const FREE_FEATURES = [
  "Beranda dengan hitung mundur dan ringkasan persiapan",
  "Checklist otomatis sesuai jenis acara, bisa ditambah sendiri",
  "Kalender tenggat tugas dan agenda",
  "Tabungan pernikahan dengan target bulanan",
  "Pengingat tugas yang mendekati atau lewat tenggat",
];

type Tier = "free" | "full";

const MORE_FEATURES: ReadonlyArray<readonly [title: string, body: string, tier: Tier | null]> = [
  ["Rundown hari H", "Susun acara per jam lengkap dengan PIC dan lokasi, lalu cetak untuk keluarga dan panitia.", "full"],
  ["Kalender", "Tenggat tugas, jatuh tempo pembayaran, dan agenda seperti fitting atau food tasting dalam satu tampilan.", "free"],
  ["Tabungan bersama", "Catat setoran masing-masing dan pantau progres menuju target.", "free"],
  ["Seserahan", "Daftar barang, perkiraan dan harga asli, penanggung jawab, sampai status siap diserahkan.", "full"],
  ["Laporan & ekspor", "Ringkasan siap cetak, serta ekspor tamu, vendor, pengeluaran, dan rundown ke CSV atau Excel.", null],
  ["Impor tamu", "Punya daftar tamu di Excel? Unggah file CSV atau XLSX memakai template yang disediakan.", "full"],
  ["Pengingat", "Notifikasi saat tugas mendekati atau lewat tenggat, pembayaran jatuh tempo, atau tamu mengirim RSVP.", "free"],
  ["Bisa dipasang di HP", "Buka dari browser, lalu tambahkan ke layar utama. Tidak perlu unduh dari toko aplikasi.", "free"],
];

const STEPS = [
  ["Daftar gratis", "Cukup nama, email, dan password."],
  ["Isi data pernikahan", "Tanggal, jenis acara, dan proses nikah. Checklist dan kategori anggaran langsung tersusun."],
  ["Aktifkan & ajak pasangan", "Dengan Akses Penuh, kirim tautan ke pasangan agar kalian bekerja di data yang sama."],
  ["Terbitkan undangan", "Bagikan tautan pribadi ke tiap tamu, lalu pantau RSVP dan ucapan yang masuk."],
] as const;

/** Which plan a feature belongs to, so nobody discovers a paywall after signing up. */
function TierBadge({ tier, planName }: { tier: Tier; planName: string }) {
  return tier === "free" ? (
    <span className="inline-flex rounded-full bg-sage-50 px-2.5 py-0.5 text-xs font-semibold text-sage-700 ring-1 ring-sage-100">Gratis</span>
  ) : (
    <span className="inline-flex rounded-full bg-clay-50 px-2.5 py-0.5 text-xs font-semibold text-clay-700 ring-1 ring-clay-100">{planName}</span>
  );
}

function Check() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0 text-sage-700">
      <path fill="currentColor" d="M8.1 13.6 4.5 10l-1.1 1.1 4.7 4.7 9-9-1.1-1.1z" />
    </svg>
  );
}

function SectionHeading({ id, eyebrow, title, intro }: { id: string; eyebrow: string; title: string; intro?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-widest text-clay-700">{eyebrow}</p>
      <h2 id={id} className="mt-2 font-display text-3xl font-semibold leading-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {intro ? <p className="mt-3 text-lg text-ink-700">{intro}</p> : null}
    </div>
  );
}

function FeatureRow({
  title,
  body,
  points,
  visual,
  badge,
  reverse = false,
}: {
  title: string;
  body: string;
  points: string[];
  visual: React.ReactNode;
  badge: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
      <div className={reverse ? "md:order-2" : undefined}>
        {badge}
        <h3 className="mt-2 font-display text-2xl font-semibold">{title}</h3>
        <p className="mt-2 text-ink-700">{body}</p>
        <ul className="mt-4 space-y-2">
          {points.map((point) => (
            <li key={point} className="flex gap-2 text-ink-700">
              <Check />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={reverse ? "md:order-1" : undefined}>{visual}</div>
    </div>
  );
}

export default async function HomePage() {
  const { plan, demo, counts } = await getLandingData();
  const demoHref = demo ? `/undangan/${demo.slug}` : null;
  const planName = plan?.name ?? "Akses Penuh";
  const free = <TierBadge tier="free" planName={planName} />;
  const full = <TierBadge tier="full" planName={planName} />;
  const taskCount = counts ? `${Math.floor(counts.taskTemplates / 10) * 10}+` : null;
  const faqs: Array<[string, string]> = [
    [
      "Apakah Sehati gratis?",
      `Ya. Mendaftar dan fitur dasar (checklist, kalender, tabungan, pengingat) gratis tanpa batas waktu. Vendor, anggaran, tamu & RSVP, undangan digital, rundown, seserahan, dan kolaborasi pasangan ada di ${plan?.name ?? "Akses Penuh"}${plan ? `, ${formatRupiah(plan.price)} ${plan.durationDays ? `untuk ${plan.durationDays} hari` : "sekali bayar untuk satu pernikahan"}` : ""}.`,
    ],
    [
      "Bisa dipakai berdua dengan pasangan?",
      `Bisa. Setelah ${plan?.name ?? "Akses Penuh"} aktif, undang pasanganmu lewat tautan. Satu pernikahan bisa dikelola ${MAX_COUPLE_MEMBERS} akun, perubahan langsung terlihat keduanya, dan setiap aktivitas tercatat.`,
    ],
    [
      "Apakah perlu mengunduh aplikasi?",
      "Tidak. Sehati berjalan di browser HP maupun laptop. Di HP kamu bisa menambahkannya ke layar utama supaya terasa seperti aplikasi.",
    ],
    [
      "Bagaimana tamu mengonfirmasi kehadiran?",
      "Setiap tamu mendapat tautan undangan pribadi berisi namanya. Tamu memilih hadir, mungkin, atau tidak, beserta jumlah orang sesuai jatah kursi. Jawabannya langsung masuk ke daftar tamu kalian.",
    ],
    [
      "Kalau tanggal pernikahan berubah?",
      "Ubah tanggalnya di pengaturan. Tenggat tugas di checklist bisa dihitung ulang otomatis mengikuti tanggal yang baru.",
    ],
    [
      "Untuk acara apa saja?",
      "Akad saja, akad dan resepsi, resepsi saja, lamaran, maupun upacara adat, dengan proses nikah di KUA, upacara keagamaan, atau pencatatan sipil. Checklist disusun sesuai pilihan kalian.",
    ],
    [
      "Apakah data kami aman?",
      "Rencana pernikahan, anggaran, dan daftar tamu hanya bisa dilihat anggota pernikahan itu. Undangan baru tampil untuk umum setelah kalian terbitkan, dan semua koneksi memakai HTTPS.",
    ],
    [
      "Bisa impor daftar tamu dari Excel?",
      "Bisa. Unggah file CSV atau XLSX memakai template yang tersedia, periksa pratinjaunya, lalu simpan.",
    ],
  ];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-cream-200/80 bg-cream-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Brand />
          <nav aria-label="Bagian halaman" className="hidden items-center gap-1 md:flex">
            {NAV.map(([href, label]) => (
              <a key={href} href={href} className={buttonClassName("ghost", "px-4")}>
                {label}
              </a>
            ))}
          </nav>
          <nav aria-label="Akun" className="flex items-center gap-1 sm:gap-2">
            <Link href="/login" className={buttonClassName("ghost", "px-3 sm:px-5")}>
              Masuk
            </Link>
            <Link href="/register" className={buttonClassName("primary", "px-4 sm:px-5")}>
              Daftar gratis
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 md:grid-cols-2 md:py-20">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-clay-700">Wedding planner untuk berdua</p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-balance sm:text-5xl">
              Siapkan pernikahan bersama pasangan, dari checklist sampai undangan.
            </h1>
            <p className="mt-4 text-lg text-ink-700">
              {SITE.name} menyatukan semua persiapan dalam satu ruang kerja: hitung mundur, tugas, anggaran, vendor, tamu, dan undangan
              digital dengan RSVP. Kalian berdua melihat data yang sama, kapan pun.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className={buttonClassName("primary", "px-6")}>
                Mulai gratis
              </Link>
              {demoHref ? (
                <Link href={demoHref} className={buttonClassName("secondary", "px-6")}>
                  Lihat contoh undangan
                </Link>
              ) : (
                <a href="#fitur" className={buttonClassName("secondary", "px-6")}>
                  Lihat fiturnya
                </a>
              )}
            </div>
            <p className="mt-4 text-sm text-ink-500">Gratis untuk mulai. Tanpa kartu kredit, tanpa unduh aplikasi.</p>
          </div>
          <DashboardMock />
        </section>

        {/* Facts */}
        <section aria-label="Sehati dalam angka" className="border-y border-cream-200 bg-white">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 text-center md:grid-cols-4">
            {[
              [taskCount ?? "Ratusan", "tugas siap pakai di checklist"],
              [counts ? String(counts.budgetCategories) : "Belasan", "kategori anggaran bawaan"],
              [String(INVITATION_THEMES.length), "tema undangan digital"],
              [String(MAX_COUPLE_MEMBERS), "akun, satu rencana bersama"],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="sr-only">{label}</dt>
                <dd>
                  <span className="block font-display text-4xl font-semibold text-clay-700">{value}</span>
                  <span className="mt-1 block text-sm text-ink-700">{label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Together */}
        <section aria-labelledby="bersama-heading" className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="grid items-center gap-10 md:grid-cols-2 md:gap-12">
            <div>
              <SectionHeading
                id="bersama-heading"
                eyebrow="Dikerjakan bersama"
                title="Satu mengurus vendor, satu mengurus tamu. Keduanya tetap tahu semuanya."
              />
              <ul className="mt-6 space-y-3">
                {[
                  `Undang pasangan lewat tautan (${planName}); kalian bekerja di data yang sama.`,
                  "Riwayat aktivitas menunjukkan siapa mengubah apa, dan kapan.",
                  "Catatan berdua di beranda untuk hal yang tidak boleh terlupa.",
                  "Pengingat otomatis untuk tenggat tugas dan pembayaran.",
                ].map((point) => (
                  <li key={point} className="flex gap-2 text-ink-700">
                    <Check />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
            <TogetherMock />
          </div>
        </section>

        {/* Core features */}
        <section id="fitur" aria-labelledby="fitur-heading" className="scroll-mt-20 bg-white py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4">
            <SectionHeading
              id="fitur-heading"
              eyebrow="Fitur utama"
              title="Semua yang biasanya tercecer di catatan, spreadsheet, dan grup chat."
            />
            <div className="mt-12 space-y-16 md:space-y-24">
              <FeatureRow
                badge={free}
                title="Checklist yang tersusun sendiri"
                body="Isi tanggal dan jenis acara, lalu daftar tugas lengkap dengan tenggatnya langsung muncul, dari urusan KUA sampai souvenir."
                points={[
                  "Disusun sesuai jenis acara dan proses nikah kalian",
                  "Tambah, ubah, dan tandai tugas; progres terlihat di beranda",
                  "Tenggat bisa dihitung ulang kalau tanggal pernikahan berubah",
                ]}
                visual={<ChecklistMock />}
              />
              <FeatureRow
                reverse
                badge={full}
                title="Anggaran tanpa kejutan"
                body="Tetapkan target, bagi ke kategori, dan catat setiap tagihan serta pembayarannya. Sisa tagihan selalu terhitung dari data, bukan tebakan."
                points={[
                  counts ? `${counts.budgetCategories} kategori bawaan yang bisa kalian sesuaikan` : "Kategori bawaan yang bisa kalian sesuaikan",
                  "Catat DP, cicilan, dan pelunasan beserta tanggal jatuh temponya",
                  "Lihat mana yang sudah lunas dan mana yang masih harus dibayar",
                ]}
                visual={<BudgetMock />}
              />
              <FeatureRow
                badge={full}
                title="Vendor: dari riset sampai dipesan"
                body="Kumpulkan kandidat, bandingkan harga dan kelebihannya, lalu pilih satu. Kontrak dan pembayarannya otomatis masuk ke anggaran."
                points={[
                  counts ? `${counts.vendorCategories} kategori vendor, dari gedung sampai MC` : "Kategori vendor dari gedung sampai MC",
                  "Rating, catatan kelebihan dan kekurangan, serta jadwal meeting",
                  "Satu daftar vendor terpesan beserta kontaknya",
                ]}
                visual={<VendorMock />}
              />
              <FeatureRow
                reverse
                badge={full}
                title="Tamu dan RSVP dalam satu daftar"
                body="Kelompokkan tamu, atur jatah kursi, dan lihat siapa yang sudah menjawab. Jumlah tamu hadir terhitung otomatis."
                points={[
                  "Grup tamu: keluarga, teman, rekan kerja, dan lainnya",
                  "Tautan undangan pribadi untuk setiap tamu",
                  "Impor dari CSV atau Excel, ekspor kapan saja",
                ]}
                visual={<GuestMock />}
              />
            </div>
          </div>
        </section>

        {/* Invitation */}
        <section id="undangan" aria-labelledby="undangan-heading" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="grid items-center gap-10 md:grid-cols-2 md:gap-12">
            <div>
              <div className="mb-3">{full}</div>
              <SectionHeading
                id="undangan-heading"
                eyebrow="Undangan digital"
                title="Undangan yang menyapa tamu dengan namanya."
                intro={`Pilih dari ${INVITATION_THEMES.length} tema, isi bagian yang kalian perlukan, lalu terbitkan. Setiap tamu membuka tautan pribadi dengan namanya di sampul dan bisa langsung mengonfirmasi kehadiran.`}
              />
              <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                {[
                  "Profil mempelai & kutipan",
                  "Acara dengan tombol peta",
                  "Hitung mundur",
                  "Cerita cinta & galeri foto",
                  "RSVP dengan jatah kursi",
                  "Ucapan & doa tamu",
                  "Hadiah digital & alamat kado",
                  "Musik latar",
                ].map((item) => (
                  <li key={item} className="flex gap-2 text-ink-700">
                    <Check />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {demoHref ? (
                <Link href={demoHref} className={buttonClassName("secondary", "mt-8 px-6")}>
                  Buka contoh undangan
                </Link>
              ) : null}
            </div>
            <InvitationMock demo={demo} />
          </div>
        </section>

        {/* More features */}
        <section aria-labelledby="lainnya-heading" className="bg-white py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4">
            <SectionHeading id="lainnya-heading" eyebrow="Dan masih ada" title="Detail kecil yang membuat hari H lebih tenang." />
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {MORE_FEATURES.map(([title, body, tier]) => (
                <li key={title} className="rounded-3xl border border-cream-200 bg-cream-50 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-ink-900">{title}</h3>
                    {tier ? <TierBadge tier={tier} planName={planName} /> : null}
                  </div>
                  <p className="mt-2 text-sm text-ink-700">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Steps */}
        <section aria-labelledby="mulai-heading" className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <SectionHeading id="mulai-heading" eyebrow="Cara mulai" title="Empat langkah, lalu kalian tinggal mencentang." />
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, body], index) => (
              <li key={title} className="rounded-3xl border border-cream-200 bg-white p-5">
                <span className="grid size-9 place-items-center rounded-full bg-clay-600 font-semibold text-white">{index + 1}</span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-ink-700">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing */}
        <section id="harga" aria-labelledby="harga-heading" className="scroll-mt-20 bg-white py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4">
            <SectionHeading
              id="harga-heading"
              eyebrow="Harga"
              title="Mulai gratis. Buka semua fitur saat kalian siap."
              intro="Tidak ada langganan bulanan. Akses penuh berlaku untuk satu pernikahan."
            />
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <div className="flex flex-col rounded-3xl border border-cream-200 bg-cream-50 p-6 sm:p-8">
                <h3 className="font-display text-2xl font-semibold">Gratis</h3>
                <p className="mt-2 font-display text-4xl font-semibold">Rp0</p>
                <p className="mt-1 text-sm text-ink-500">Tanpa batas waktu untuk fitur dasar</p>
                <ul className="mb-8 mt-6 space-y-2.5">
                  {FREE_FEATURES.map((feature) => (
                    <li key={feature} className="flex gap-2 text-ink-700">
                      <Check />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/register" className={buttonClassName("secondary", "mt-auto w-full")}>
                  Daftar gratis
                </Link>
              </div>
              <div className="rounded-3xl border-2 border-clay-600 bg-white p-6 shadow-sm sm:p-8">
                <h3 className="font-display text-2xl font-semibold">{plan?.name ?? "Akses Penuh"}</h3>
                {plan ? (
                  <>
                    <p className="mt-2 font-display text-4xl font-semibold">{formatRupiah(plan.price)}</p>
                    <p className="mt-1 text-sm text-ink-500">
                      {plan.durationDays ? `Berlaku ${plan.durationDays} hari` : "Sekali bayar untuk satu pernikahan"}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-ink-700">Harga terlihat setelah mendaftar.</p>
                )}
                <p className="mt-6 text-sm font-semibold text-ink-900">Semua fitur gratis, ditambah:</p>
                <ul className="mt-3 space-y-2.5">
                  {(plan?.features ?? []).map((feature) => (
                    <li key={feature} className="flex gap-2 text-ink-700">
                      <Check />
                      <span>{FEATURE_LABEL[feature]}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/register" className={buttonClassName("primary", "mt-8 w-full")}>
                  Daftar, lalu aktifkan
                </Link>
                <p className="mt-3 text-center text-sm text-ink-500">Aktifkan kapan saja dari menu Akses &amp; pembayaran.</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-20 mx-auto max-w-3xl px-4 py-16 md:py-24">
          <SectionHeading id="faq-heading" eyebrow="FAQ" title="Pertanyaan yang sering muncul" />
          <div className="mt-8 divide-y divide-cream-200 rounded-3xl border border-cream-200 bg-white">
            {faqs.map(([question, answer]) => (
              <details key={question} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink-900">
                  {question}
                  <span aria-hidden="true" className="text-xl text-clay-700 transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-ink-700">{answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Closing */}
        <section aria-labelledby="ajakan-heading" className="px-4 pb-20">
          <div className="mx-auto max-w-6xl rounded-[2rem] bg-gradient-to-br from-clay-600 to-clay-700 px-6 py-12 text-center text-white sm:px-12 sm:py-16">
            <h2 id="ajakan-heading" className="font-display text-3xl font-semibold text-balance sm:text-4xl">
              Hari bahagia kalian layak dipersiapkan dengan tenang.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-white/90">Mulai dari checklist hari ini. Pasangan bisa menyusul kapan saja.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/register" className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 font-semibold text-clay-700 hover:bg-cream-100">
                Mulai gratis
              </Link>
              <Link href="/login" className="inline-flex min-h-11 items-center justify-center rounded-full px-6 font-semibold text-white ring-1 ring-white/60 hover:bg-white/10">
                Saya sudah punya akun
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-cream-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Brand />
            <p className="mt-2 max-w-xs text-sm text-ink-500">{SITE.tagline}</p>
          </div>
          <nav aria-label="Tautan kaki" className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
            {NAV.map(([href, label]) => (
              <a key={href} href={href} className="text-ink-700 hover:text-clay-700">
                {label}
              </a>
            ))}
            <Link href="/login" className="text-ink-700 hover:text-clay-700">
              Masuk
            </Link>
            <Link href="/register" className="text-ink-700 hover:text-clay-700">
              Daftar
            </Link>
          </nav>
        </div>
        <p className="border-t border-cream-200 px-4 py-4 text-center text-xs text-ink-500">
          © {new Date().getFullYear()} {SITE.name}
        </p>
      </footer>
    </div>
  );
}
