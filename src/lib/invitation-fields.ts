/** Editable fields per section type. Kept in step with SECTION_CONTENT_SCHEMAS. */
import type { InvitationSectionTypeValue } from "@/lib/invitation";

export type SectionField = {
  name: string;
  label: string;
  type: "text" | "textarea";
  maxLength: number;
  rows?: number;
  placeholder?: string;
  hint?: string;
};

const INTRO: SectionField = {
  name: "intro",
  label: "Pengantar",
  type: "textarea",
  rows: 3,
  maxLength: 300,
  hint: "Kalimat singkat di atas isi bagian ini.",
};

export const SECTION_FIELDS: Record<InvitationSectionTypeValue, SectionField[]> = {
  COVER: [
    { name: "prefix", label: "Teks di atas nama", type: "text", maxLength: 60, placeholder: "The Wedding Of" },
    { name: "note", label: "Catatan di sampul", type: "textarea", rows: 2, maxLength: 200 },
  ],
  COUPLE: [
    { ...INTRO, hint: "Contoh: Assalamualaikum Wr. Wb. Dengan memohon rahmat Allah SWT…" },
    { name: "brideFullName", label: "Nama lengkap mempelai wanita", type: "text", maxLength: 120 },
    { name: "brideParents", label: "Orang tua mempelai wanita", type: "textarea", rows: 2, maxLength: 200 },
    { name: "brideInstagram", label: "Instagram mempelai wanita", type: "text", maxLength: 100, placeholder: "tanpa @" },
    { name: "groomFullName", label: "Nama lengkap mempelai pria", type: "text", maxLength: 120 },
    { name: "groomParents", label: "Orang tua mempelai pria", type: "textarea", rows: 2, maxLength: 200 },
    { name: "groomInstagram", label: "Instagram mempelai pria", type: "text", maxLength: 100, placeholder: "tanpa @" },
  ],
  QUOTE: [
    { name: "text", label: "Kutipan", type: "textarea", rows: 4, maxLength: 600 },
    { name: "source", label: "Sumber", type: "text", maxLength: 120, placeholder: "QS. Ar-Rum: 21" },
  ],
  EVENTS: [INTRO],
  COUNTDOWN: [],
  LOVE_STORY: [INTRO],
  GALLERY: [INTRO],
  LOCATION: [INTRO],
  RSVP: [INTRO],
  WISHES: [INTRO],
  GIFT: [INTRO],
  CLOSING: [
    { name: "message", label: "Pesan penutup", type: "textarea", rows: 4, maxLength: 600 },
    { name: "signature", label: "Tanda tangan", type: "text", maxLength: 120, placeholder: "Kami yang berbahagia" },
  ],
};
