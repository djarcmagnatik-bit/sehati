/**
 * Default checklist content (Indonesia). Admins will manage these in the database later; the app
 * never depends on a fixed number of templates.
 */
import type { TaskPriorityValue } from "@/lib/checklist";

export type TaskCategorySeed = { code: string; name: string; sortOrder: number };

export const TASK_CATEGORIES: TaskCategorySeed[] = [
  { code: "PLANNING", name: "Perencanaan", sortOrder: 10 },
  { code: "FINANCE", name: "Keuangan", sortOrder: 20 },
  { code: "ADMINISTRATION", name: "Administrasi", sortOrder: 30 },
  { code: "CEREMONY", name: "Akad & Upacara", sortOrder: 40 },
  { code: "VENUE", name: "Venue", sortOrder: 50 },
  { code: "CATERING", name: "Catering", sortOrder: 60 },
  { code: "DECORATION", name: "Dekorasi", sortOrder: 70 },
  { code: "DOCUMENTATION", name: "Dokumentasi", sortOrder: 80 },
  { code: "CLOTHING", name: "Busana", sortOrder: 90 },
  { code: "MAKEUP", name: "Rias & Makeup", sortOrder: 100 },
  { code: "INVITATION", name: "Undangan", sortOrder: 110 },
  { code: "GUESTS", name: "Tamu", sortOrder: 120 },
  { code: "SESERAHAN", name: "Seserahan", sortOrder: 130 },
  { code: "ENTERTAINMENT", name: "Hiburan", sortOrder: 140 },
  { code: "TRANSPORTATION", name: "Transportasi", sortOrder: 150 },
  { code: "ACCOMMODATION", name: "Akomodasi", sortOrder: 160 },
  { code: "HONEYMOON", name: "Bulan Madu", sortOrder: 170 },
  { code: "POST_WEDDING", name: "Setelah Menikah", sortOrder: 180 },
  { code: "OTHER", name: "Lainnya", sortOrder: 190 },
];

export type TaskTemplateSeed = {
  code: string;
  title: string;
  description: string | null;
  categoryCode: string;
  deadlineOffsetDays: number;
  priority: TaskPriorityValue;
  /** Event type codes; empty = all. */
  eventTypeCodes: readonly string[];
  /** Marriage process codes; empty = all. */
  marriageProcessCodes: readonly string[];
};

// Event type groups (codes from reference-data.ts)
const ALL: readonly string[] = [];
const WEDDING = ["AKAD_ONLY", "AKAD_RECEPTION", "RECEPTION_ONLY", "TRADITIONAL", "CUSTOM"] as const;
const CEREMONY = ["AKAD_ONLY", "AKAD_RECEPTION", "TRADITIONAL", "CUSTOM"] as const;
const RECEPTION = ["AKAD_RECEPTION", "RECEPTION_ONLY", "TRADITIONAL", "CUSTOM"] as const;
const AKAD_ONLY = ["AKAD_ONLY"] as const;
const TRADITIONAL = ["TRADITIONAL"] as const;
const ENGAGEMENT = ["ENGAGEMENT"] as const;

// Marriage process groups
const ANY: readonly string[] = [];
const KUA = ["KUA"] as const;
const RELIGIOUS = ["RELIGIOUS"] as const;
const RELIGIOUS_OR_CIVIL = ["RELIGIOUS", "CIVIL"] as const;
const OFFICIAL = ["KUA", "RELIGIOUS", "CIVIL"] as const;

function t(
  code: string,
  title: string,
  categoryCode: string,
  deadlineOffsetDays: number,
  priority: TaskPriorityValue,
  eventTypeCodes: readonly string[],
  marriageProcessCodes: readonly string[],
  description: string | null = null,
): TaskTemplateSeed {
  return { code, title, description, categoryCode, deadlineOffsetDays, priority, eventTypeCodes, marriageProcessCodes };
}

export const TASK_TEMPLATES: TaskTemplateSeed[] = [
  // Perencanaan
  t("PLAN_CONCEPT", "Diskusikan konsep & gaya pernikahan", "PLANNING", -365, "HIGH", ALL, ANY,
    "Samakan gambaran acara impian: skala, suasana, adat, dan prioritas kalian berdua."),
  t("PLAN_FAMILY_MEETING", "Musyawarah rencana pernikahan dengan kedua keluarga", "PLANNING", -360, "HIGH", ALL, ANY),
  t("PLAN_CONFIRM_DATE", "Konfirmasi tanggal dengan keluarga & pihak terkait", "PLANNING", -340, "HIGH", ALL, ANY),
  t("PLAN_WO_RESEARCH", "Riset wedding organizer (jika diperlukan)", "PLANNING", -330, "MEDIUM", WEDDING, ANY),
  t("PLAN_WO_BOOK", "Booking wedding organizer", "PLANNING", -300, "MEDIUM", WEDDING, ANY),
  t("PLAN_RUNDOWN_DRAFT", "Susun draf rundown acara", "PLANNING", -60, "HIGH", ALL, ANY),
  t("PLAN_VENDOR_CONFIRM", "Konfirmasi ulang semua vendor", "PLANNING", -7, "URGENT", ALL, ANY,
    "Pastikan jam kedatangan, lokasi, dan PIC setiap vendor sudah sesuai."),
  t("PLAN_SHARE_CONTACTS", "Bagikan kontak vendor & PIC ke keluarga", "PLANNING", -7, "MEDIUM", ALL, ANY),
  t("PLAN_REHEARSAL", "Gladi resik bersama keluarga & vendor", "PLANNING", -2, "HIGH", WEDDING, ANY),
  t("PLAN_EMERGENCY_KIT", "Siapkan emergency kit hari H", "PLANNING", -3, "LOW", ALL, ANY,
    "Contoh: obat-obatan, peniti, benang jahit, tisu, powerbank, dan air minum."),

  // Keuangan
  t("FIN_SET_BUDGET", "Tentukan total budget pernikahan", "FINANCE", -355, "URGENT", ALL, ANY),
  t("FIN_ALLOCATE", "Alokasikan budget per kategori", "FINANCE", -350, "HIGH", ALL, ANY),
  t("FIN_SAVINGS_PLAN", "Buat rencana menabung bersama", "FINANCE", -350, "MEDIUM", ALL, ANY),
  t("FIN_PAYMENT_SCHEDULE", "Catat jadwal DP & pelunasan semua vendor", "FINANCE", -150, "HIGH", ALL, ANY),
  t("FIN_VENDOR_ENVELOPES", "Siapkan amplop untuk vendor & kru", "FINANCE", -5, "LOW", ALL, ANY),

  // Administrasi — KUA
  t("ADM_KUA_DOCUMENTS", "Kumpulkan dokumen nikah", "ADMINISTRATION", -120, "URGENT", WEDDING, KUA,
    "Umumnya: fotokopi KTP, KK, akta kelahiran, ijazah terakhir, dan pas foto. Cek ketentuan KUA setempat."),
  t("ADM_RT_RW_LETTER", "Urus surat pengantar RT/RW", "ADMINISTRATION", -100, "HIGH", WEDDING, KUA),
  t("ADM_VILLAGE_LETTER", "Urus surat pengantar nikah dari kelurahan/desa", "ADMINISTRATION", -90, "HIGH", WEDDING, KUA),
  t("ADM_HEALTH_CHECK", "Periksa kesehatan calon pengantin di puskesmas", "ADMINISTRATION", -90, "HIGH", WEDDING, KUA,
    "Beberapa daerah mensyaratkan surat keterangan sehat/imunisasi. Tanyakan ke KUA setempat."),
  t("ADM_NUMPANG_NIKAH", "Urus surat rekomendasi nikah (jika akad di luar kecamatan domisili)", "ADMINISTRATION", -75, "MEDIUM", WEDDING, KUA),
  t("ADM_KUA_REGISTER", "Daftar nikah ke KUA", "ADMINISTRATION", -60, "URGENT", WEDDING, KUA,
    "Pendaftaran paling lambat 10 hari kerja sebelum akad. Lebih awal lebih aman."),
  t("ADM_PREMARITAL_GUIDANCE", "Ikuti bimbingan perkawinan (Bimwin)", "ADMINISTRATION", -45, "MEDIUM", WEDDING, KUA),
  t("ADM_KUA_OFFSITE_FEE", "Bayar biaya nikah di luar kantor KUA (jika akad di luar KUA)", "ADMINISTRATION", -30, "MEDIUM", WEDDING, KUA,
    "Pembayaran resmi melalui bank persepsi. Simpan bukti setorannya."),

  // Administrasi — keagamaan & sipil
  t("ADM_RELIGIOUS_DOCUMENTS", "Lengkapi persyaratan dokumen dari rumah ibadah", "ADMINISTRATION", -120, "HIGH", WEDDING, RELIGIOUS),
  t("ADM_CIVIL_DOCUMENTS", "Siapkan dokumen pencatatan perkawinan di Dukcapil", "ADMINISTRATION", -90, "URGENT", WEDDING, RELIGIOUS_OR_CIVIL),
  t("ADM_CIVIL_REGISTER", "Daftarkan pencatatan perkawinan ke Dukcapil", "ADMINISTRATION", -60, "URGENT", WEDDING, RELIGIOUS_OR_CIVIL),

  // Akad & upacara
  t("CER_LOCATION", "Tentukan lokasi akad / upacara", "CEREMONY", -300, "HIGH", CEREMONY, ANY),
  t("CER_WALI_WITNESSES", "Tentukan wali nikah & dua orang saksi", "CEREMONY", -60, "HIGH", CEREMONY, KUA),
  t("CER_MAHAR", "Siapkan mahar / mas kawin", "CEREMONY", -45, "HIGH", CEREMONY, KUA),
  t("CER_PENGHULU_CONFIRM", "Konfirmasi jadwal penghulu", "CEREMONY", -14, "HIGH", CEREMONY, KUA),
  t("CER_IJAB_PRACTICE", "Latihan ijab kabul", "CEREMONY", -7, "MEDIUM", CEREMONY, KUA),
  t("CER_RELIGIOUS_SCHEDULE", "Jadwalkan pemberkatan / upacara di rumah ibadah", "CEREMONY", -240, "URGENT", CEREMONY, RELIGIOUS),
  t("CER_PREMARITAL_COURSE", "Ikuti kursus / bimbingan pranikah", "CEREMONY", -120, "HIGH", CEREMONY, RELIGIOUS),
  t("CER_RELIGIOUS_ANNOUNCEMENT", "Umumkan rencana pernikahan di rumah ibadah (jika disyaratkan)", "CEREMONY", -60, "LOW", CEREMONY, RELIGIOUS),
  t("CER_RELIGIOUS_REHEARSAL", "Gladi upacara keagamaan", "CEREMONY", -3, "MEDIUM", CEREMONY, RELIGIOUS),
  t("CER_CIVIL_WITNESSES", "Tentukan dua orang saksi pencatatan perkawinan", "CEREMONY", -45, "HIGH", WEDDING, RELIGIOUS_OR_CIVIL),
  t("CER_ADAT_CONSULT", "Konsultasi dengan sesepuh / pemuka adat", "CEREMONY", -180, "HIGH", TRADITIONAL, ANY),
  t("CER_ADAT_EQUIPMENT", "Siapkan perlengkapan upacara adat", "CEREMONY", -60, "HIGH", TRADITIONAL, ANY),
  t("CER_ADAT_PRE_RITUALS", "Persiapkan prosesi adat sebelum hari H", "CEREMONY", -14, "MEDIUM", TRADITIONAL, ANY,
    "Contoh: siraman, midodareni, atau prosesi lain sesuai adat kalian."),
  t("CER_ENGAGEMENT_VISIT", "Jadwalkan kunjungan keluarga untuk lamaran", "CEREMONY", -60, "HIGH", ENGAGEMENT, ANY),
  t("CER_ENGAGEMENT_SPEAKER", "Tentukan juru bicara keluarga", "CEREMONY", -30, "MEDIUM", ENGAGEMENT, ANY),

  // Venue
  t("VENUE_RESEARCH", "Survei & bandingkan venue resepsi", "VENUE", -330, "HIGH", RECEPTION, ANY),
  t("VENUE_BOOK", "Booking venue resepsi & bayar DP", "VENUE", -300, "URGENT", RECEPTION, ANY),
  t("VENUE_ENGAGEMENT", "Tentukan tempat acara lamaran", "VENUE", -60, "MEDIUM", ENGAGEMENT, ANY),
  t("VENUE_TECH_MEETING", "Technical meeting dengan pihak venue", "VENUE", -30, "HIGH", RECEPTION, ANY),
  t("VENUE_FINAL_PAYMENT", "Pelunasan venue", "VENUE", -21, "HIGH", RECEPTION, ANY),

  // Catering
  t("CATERING_RESEARCH", "Riset & bandingkan vendor catering", "CATERING", -270, "HIGH", RECEPTION, ANY),
  t("CATERING_TASTING", "Food tasting catering", "CATERING", -240, "MEDIUM", RECEPTION, ANY),
  t("CATERING_BOOK", "Booking catering & bayar DP", "CATERING", -210, "HIGH", RECEPTION, ANY),
  t("CATERING_FINAL_MENU", "Finalisasi menu & jumlah porsi", "CATERING", -30, "HIGH", RECEPTION, ANY),
  t("CATERING_FINAL_PAYMENT", "Pelunasan catering", "CATERING", -14, "HIGH", RECEPTION, ANY),
  t("CATERING_SMALL_EVENT", "Siapkan konsumsi untuk tamu acara", "CATERING", -30, "MEDIUM", [...AKAD_ONLY, ...ENGAGEMENT], ANY),

  // Dekorasi
  t("DECOR_RESEARCH", "Riset vendor dekorasi", "DECORATION", -240, "MEDIUM", RECEPTION, ANY),
  t("DECOR_BOOK", "Booking dekorasi & bayar DP", "DECORATION", -180, "HIGH", RECEPTION, ANY),
  t("DECOR_FINAL_CONCEPT", "Finalisasi konsep dekorasi & bunga", "DECORATION", -60, "MEDIUM", RECEPTION, ANY),
  t("DECOR_CEREMONY_AREA", "Siapkan dekorasi area akad / upacara", "DECORATION", -45, "MEDIUM", CEREMONY, ANY),
  t("DECOR_FINAL_PAYMENT", "Pelunasan dekorasi", "DECORATION", -14, "MEDIUM", RECEPTION, ANY),

  // Dokumentasi
  t("DOC_RESEARCH", "Riset fotografer & videografer", "DOCUMENTATION", -240, "HIGH", WEDDING, ANY),
  t("DOC_BOOK", "Booking fotografer & videografer", "DOCUMENTATION", -210, "HIGH", WEDDING, ANY),
  t("DOC_PREWEDDING_CONCEPT", "Tentukan konsep foto prewedding", "DOCUMENTATION", -150, "LOW", WEDDING, ANY),
  t("DOC_PREWEDDING_SHOOT", "Sesi foto prewedding", "DOCUMENTATION", -90, "MEDIUM", WEDDING, ANY),
  t("DOC_SHOT_LIST", "Buat daftar foto wajib untuk hari H", "DOCUMENTATION", -21, "MEDIUM", WEDDING, ANY),
  t("DOC_FINAL_PAYMENT", "Pelunasan dokumentasi", "DOCUMENTATION", -14, "MEDIUM", WEDDING, ANY),
  t("DOC_ENGAGEMENT", "Atur dokumentasi acara lamaran", "DOCUMENTATION", -30, "LOW", ENGAGEMENT, ANY),

  // Busana
  t("CLOTH_CONCEPT", "Tentukan konsep busana pengantin", "CLOTHING", -240, "MEDIUM", ALL, ANY),
  t("CLOTH_BOOK", "Pesan / sewa busana pengantin", "CLOTHING", -180, "HIGH", ALL, ANY),
  t("CLOTH_FAMILY_UNIFORM", "Tentukan seragam keluarga & bridesmaid", "CLOTHING", -150, "MEDIUM", WEDDING, ANY),
  t("CLOTH_RINGS", "Pesan cincin pernikahan", "CLOTHING", -120, "HIGH", WEDDING, ANY),
  t("CLOTH_ENGAGEMENT_RING", "Siapkan cincin lamaran", "CLOTHING", -45, "HIGH", ENGAGEMENT, ANY),
  t("CLOTH_FIRST_FITTING", "Fitting busana pertama", "CLOTHING", -90, "MEDIUM", ALL, ANY),
  t("CLOTH_ACCESSORIES", "Siapkan sepatu & aksesori", "CLOTHING", -30, "MEDIUM", ALL, ANY),
  t("CLOTH_FINAL_FITTING", "Fitting busana terakhir", "CLOTHING", -21, "HIGH", ALL, ANY),

  // Rias
  t("MUA_RESEARCH", "Riset makeup artist (MUA)", "MAKEUP", -210, "MEDIUM", ALL, ANY),
  t("MUA_BOOK", "Booking MUA & bayar DP", "MAKEUP", -180, "HIGH", ALL, ANY),
  t("MUA_SELF_CARE", "Mulai perawatan kulit & tubuh", "MAKEUP", -90, "LOW", ALL, ANY),
  t("MUA_TRIAL", "Trial makeup", "MAKEUP", -60, "MEDIUM", ALL, ANY),
  t("MUA_FAMILY", "Atur rias untuk keluarga inti", "MAKEUP", -45, "LOW", WEDDING, ANY),

  // Undangan
  t("INV_DESIGN", "Tentukan desain undangan (digital / cetak)", "INVITATION", -150, "MEDIUM", ALL, ANY),
  t("INV_PRINT_ORDER", "Pesan undangan cetak (jika ada)", "INVITATION", -90, "LOW", WEDDING, ANY),
  t("INV_DIGITAL", "Buat undangan digital", "INVITATION", -75, "MEDIUM", ALL, ANY),
  t("INV_SEND", "Kirim undangan ke tamu", "INVITATION", -45, "HIGH", ALL, ANY),

  // Tamu
  t("GUEST_ESTIMATE", "Perkirakan jumlah tamu", "GUESTS", -340, "HIGH", ALL, ANY),
  t("GUEST_LIST_DRAFT", "Susun daftar tamu dari kedua keluarga", "GUESTS", -180, "HIGH", ALL, ANY),
  t("GUEST_SOUVENIR_ORDER", "Tentukan & pesan souvenir", "GUESTS", -90, "MEDIUM", RECEPTION, ANY),
  t("GUEST_LIST_FINAL", "Finalisasi daftar tamu & jumlah kursi", "GUESTS", -75, "HIGH", ALL, ANY),
  t("GUEST_RECEPTIONISTS", "Tunjuk penerima tamu & among tamu", "GUESTS", -30, "MEDIUM", RECEPTION, ANY),
  t("GUEST_RSVP_FOLLOW_UP", "Follow up tamu yang belum RSVP", "GUESTS", -21, "MEDIUM", ALL, ANY),
  t("GUEST_VIP_SEATING", "Atur tempat duduk keluarga & tamu VIP", "GUESTS", -14, "MEDIUM", RECEPTION, ANY),
  t("GUEST_SOUVENIR_READY", "Pastikan souvenir sudah siap", "GUESTS", -14, "LOW", RECEPTION, ANY),

  // Seserahan
  t("SES_LIST", "Susun daftar seserahan", "SESERAHAN", -120, "MEDIUM", ALL, ANY),
  t("SES_BUY", "Beli barang seserahan", "SESERAHAN", -45, "MEDIUM", ALL, ANY),
  t("SES_PACK", "Hias & kemas seserahan", "SESERAHAN", -14, "LOW", ALL, ANY),

  // Hiburan
  t("ENT_MC_BOOK", "Booking MC", "ENTERTAINMENT", -120, "MEDIUM", RECEPTION, ANY),
  t("ENT_MUSIC_RESEARCH", "Riset hiburan (band / organ tunggal / akustik)", "ENTERTAINMENT", -180, "LOW", RECEPTION, ANY),
  t("ENT_MUSIC_BOOK", "Booking hiburan", "ENTERTAINMENT", -150, "MEDIUM", RECEPTION, ANY),
  t("ENT_SONG_LIST", "Buat daftar lagu", "ENTERTAINMENT", -30, "LOW", RECEPTION, ANY),

  // Transportasi & akomodasi
  t("TRANS_WEDDING_CAR", "Siapkan mobil pengantin", "TRANSPORTATION", -60, "MEDIUM", WEDDING, ANY),
  t("TRANS_FAMILY", "Atur transportasi keluarga dari luar kota", "TRANSPORTATION", -45, "MEDIUM", ALL, ANY),
  t("ACC_FAMILY_LODGING", "Pesan penginapan untuk keluarga luar kota", "ACCOMMODATION", -60, "MEDIUM", ALL, ANY),
  t("ACC_BRIDAL_ROOM", "Siapkan kamar pengantin / ruang rias", "ACCOMMODATION", -30, "LOW", WEDDING, ANY),

  // Bulan madu
  t("HM_PLAN", "Rencanakan bulan madu", "HONEYMOON", -120, "LOW", WEDDING, ANY),
  t("HM_BOOK", "Pesan tiket & penginapan bulan madu", "HONEYMOON", -60, "LOW", WEDDING, ANY),

  // Setelah menikah
  t("POST_RETURN_RENTALS", "Kembalikan barang sewaan", "POST_WEDDING", 3, "MEDIUM", ALL, ANY),
  t("POST_THANK_YOU", "Kirim ucapan terima kasih kepada tamu & keluarga", "POST_WEDDING", 7, "LOW", ALL, ANY),
  t("POST_MARRIAGE_BOOK", "Ambil buku nikah / kutipan akta perkawinan", "POST_WEDDING", 14, "HIGH", WEDDING, OFFICIAL),
  t("POST_EXPENSE_RECAP", "Rekap pengeluaran & sisa budget", "POST_WEDDING", 14, "LOW", ALL, ANY),
  t("POST_UPDATE_ID", "Perbarui KK & status perkawinan di KTP", "POST_WEDDING", 30, "MEDIUM", WEDDING, OFFICIAL),
  t("POST_VENDOR_REVIEW", "Terima hasil foto/video & beri ulasan vendor", "POST_WEDDING", 45, "LOW", WEDDING, ANY),
];
