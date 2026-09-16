/** Default guest groups copied into every new workspace. Couples can add their own. */
export const GUEST_GROUP_TEMPLATES: Array<{ code: string; name: string; sortOrder: number }> = [
  { code: "FAMILY_BRIDE", name: "Keluarga Mempelai Wanita", sortOrder: 10 },
  { code: "FAMILY_GROOM", name: "Keluarga Mempelai Pria", sortOrder: 20 },
  { code: "FRIENDS", name: "Teman", sortOrder: 30 },
  { code: "WORK", name: "Rekan Kerja", sortOrder: 40 },
  { code: "SCHOOL", name: "Teman Sekolah / Kuliah", sortOrder: 50 },
  { code: "ORGANIZATION", name: "Organisasi", sortOrder: 60 },
  { code: "NEIGHBORS", name: "Tetangga", sortOrder: 70 },
  { code: "VIP", name: "VIP", sortOrder: 80 },
  { code: "OTHER", name: "Lainnya", sortOrder: 90 },
];
