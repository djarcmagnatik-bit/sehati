/**
 * Default vendor categories (admin-configurable later). `budgetCategoryName` pre-selects the matching
 * budget category when a vendor's contract is recorded.
 */
export const VENDOR_CATEGORIES: Array<{ code: string; name: string; sortOrder: number; budgetCategoryName: string | null }> = [
  { code: "VENUE", name: "Venue", sortOrder: 10, budgetCategoryName: "Venue" },
  { code: "CATERING", name: "Catering", sortOrder: 20, budgetCategoryName: "Catering" },
  { code: "DECORATION", name: "Dekorasi", sortOrder: 30, budgetCategoryName: "Dekorasi" },
  { code: "PHOTOGRAPHY", name: "Fotografer", sortOrder: 40, budgetCategoryName: "Fotografi" },
  { code: "VIDEOGRAPHY", name: "Videografer", sortOrder: 50, budgetCategoryName: "Videografi" },
  { code: "MAKEUP", name: "MUA / Rias", sortOrder: 60, budgetCategoryName: "Rias & Makeup" },
  { code: "ATTIRE", name: "Busana", sortOrder: 70, budgetCategoryName: "Busana" },
  { code: "WEDDING_ORGANIZER", name: "Wedding Organizer", sortOrder: 80, budgetCategoryName: "Lain-lain" },
  { code: "MC", name: "MC", sortOrder: 90, budgetCategoryName: "Hiburan" },
  { code: "ENTERTAINMENT", name: "Hiburan", sortOrder: 100, budgetCategoryName: "Hiburan" },
  { code: "INVITATION", name: "Undangan & Cetak", sortOrder: 110, budgetCategoryName: "Undangan" },
  { code: "SOUVENIR", name: "Souvenir", sortOrder: 120, budgetCategoryName: "Souvenir" },
  { code: "TRANSPORTATION", name: "Transportasi", sortOrder: 130, budgetCategoryName: "Transportasi" },
  { code: "JEWELRY", name: "Cincin & Perhiasan", sortOrder: 140, budgetCategoryName: "Cincin" },
  { code: "OTHER", name: "Lainnya", sortOrder: 190, budgetCategoryName: "Lain-lain" },
];
