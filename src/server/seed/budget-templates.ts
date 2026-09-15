/** Default budget categories copied into every new workspace. Admins may manage them later. */
export const BUDGET_CATEGORY_TEMPLATES: Array<{ code: string; name: string; sortOrder: number }> = [
  { code: "VENUE", name: "Venue", sortOrder: 10 },
  { code: "CATERING", name: "Catering", sortOrder: 20 },
  { code: "DECORATION", name: "Dekorasi", sortOrder: 30 },
  { code: "PHOTOGRAPHY", name: "Fotografi", sortOrder: 40 },
  { code: "VIDEOGRAPHY", name: "Videografi", sortOrder: 50 },
  { code: "MAKEUP", name: "Rias & Makeup", sortOrder: 60 },
  { code: "CLOTHING", name: "Busana", sortOrder: 70 },
  { code: "RINGS", name: "Cincin", sortOrder: 80 },
  { code: "INVITATION", name: "Undangan", sortOrder: 90 },
  { code: "ENTERTAINMENT", name: "Hiburan", sortOrder: 100 },
  { code: "TRANSPORTATION", name: "Transportasi", sortOrder: 110 },
  { code: "ACCOMMODATION", name: "Akomodasi", sortOrder: 120 },
  { code: "SOUVENIR", name: "Souvenir", sortOrder: 130 },
  { code: "SESERAHAN", name: "Seserahan & Mahar", sortOrder: 140 },
  { code: "ADMINISTRATION", name: "Administrasi", sortOrder: 150 },
  { code: "MISC", name: "Lain-lain", sortOrder: 160 },
];
