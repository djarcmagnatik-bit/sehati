/** Seserahan categories offered to every wedding; admins can deactivate or rename them. */
export const GIFT_CATEGORIES: Array<{ code: string; name: string; sortOrder: number }> = [
  { code: "WORSHIP", name: "Perlengkapan ibadah", sortOrder: 10 },
  { code: "CLOTHING", name: "Pakaian", sortOrder: 20 },
  { code: "SHOES_BAGS", name: "Sepatu & tas", sortOrder: 30 },
  { code: "COSMETICS", name: "Kosmetik & perawatan", sortOrder: 40 },
  { code: "JEWELRY", name: "Perhiasan", sortOrder: 50 },
  { code: "TOILETRIES", name: "Perlengkapan mandi", sortOrder: 60 },
  { code: "FOOD", name: "Makanan & kue", sortOrder: 70 },
  { code: "FRUIT", name: "Buah-buahan", sortOrder: 80 },
  { code: "OTHER", name: "Lainnya", sortOrder: 90 },
];
