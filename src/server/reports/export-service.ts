import "server-only";
import writeXlsxFile from "write-excel-file/node";
import { expensePaymentState, EXPENSE_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/budget";
import { dbDateToIso } from "@/lib/dates";
import type { ExportColumn, ExportTable, ExportValue } from "@/lib/export/table";
import { GUEST_INVITATION_LABEL, GUEST_RSVP_LABEL } from "@/lib/guests";
import { EXPORT_DATASET_FEATURE, EXPORT_DATASET_LABEL, type ExportDataset, type ExportFormat } from "@/lib/reports";
import { recordActivity } from "@/server/activity/activity-service";
import { requireWeddingFeature } from "@/server/billing/access";
import { getDb } from "@/server/db";
import { listRundown } from "@/server/planning/rundown-service";

const date = (value: Date | null) => (value ? dbDateToIso(value) : null);

async function guestsTable(weddingId: string): Promise<ExportTable> {
  const guests = await getDb().guest.findMany({
    where: { weddingId },
    orderBy: [{ group: { sortOrder: "asc" } }, { invitationName: "asc" }, { id: "asc" }],
    // Never the personal invitation token: whoever holds the file could answer RSVPs for guests.
    select: {
      invitationName: true,
      guestName: true,
      group: { select: { name: true } },
      phone: true,
      email: true,
      address: true,
      seatCount: true,
      invitationStatus: true,
      rsvpStatus: true,
      attendingCount: true,
      notes: true,
    },
  });
  return {
    title: "Tamu",
    columns: [
      { header: "Nama di undangan", kind: "text", width: 30 },
      { header: "Nama tamu", kind: "text", width: 24 },
      { header: "Grup", kind: "text", width: 22 },
      { header: "Telepon", kind: "text", width: 16 },
      { header: "Email", kind: "text", width: 26 },
      { header: "Alamat", kind: "text", width: 30 },
      { header: "Jumlah kursi", kind: "integer" },
      { header: "Status undangan", kind: "text", width: 16 },
      { header: "RSVP", kind: "text", width: 16 },
      { header: "Jumlah hadir", kind: "integer" },
      { header: "Catatan", kind: "text", width: 30 },
    ],
    rows: guests.map((guest) => [
      guest.invitationName,
      guest.guestName,
      guest.group?.name ?? null,
      guest.phone,
      guest.email,
      guest.address,
      guest.seatCount,
      GUEST_INVITATION_LABEL[guest.invitationStatus],
      GUEST_RSVP_LABEL[guest.rsvpStatus],
      guest.rsvpStatus === "ATTENDING" ? guest.attendingCount : 0,
      guest.notes,
    ]),
  };
}

/** Paid amount per expense, one query. */
async function paidByExpense(weddingId: string): Promise<Map<string, bigint>> {
  const rows = await getDb().payment.groupBy({ by: ["expenseId"], where: { weddingId }, _sum: { amount: true } });
  return new Map(rows.map((row) => [row.expenseId, row._sum.amount ?? 0n]));
}

async function vendorsTable(weddingId: string): Promise<ExportTable> {
  const db = getDb();
  const [vendors, paid] = await Promise.all([
    db.vendor.findMany({
      where: { weddingId },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }, { id: "asc" }],
      select: {
        name: true,
        category: { select: { name: true } },
        contactPerson: true,
        whatsapp: true,
        phone: true,
        instagram: true,
        website: true,
        packageName: true,
        bookingDate: true,
        eventLabel: true,
        notes: true,
        expenses: { select: { id: true, totalAmount: true } },
      },
    }),
    paidByExpense(weddingId),
  ]);
  return {
    title: "Vendor",
    columns: [
      { header: "Vendor", kind: "text", width: 26 },
      { header: "Kategori", kind: "text", width: 20 },
      { header: "Kontak", kind: "text", width: 20 },
      { header: "WhatsApp", kind: "text", width: 16 },
      { header: "Telepon", kind: "text", width: 16 },
      { header: "Instagram", kind: "text", width: 16 },
      { header: "Website", kind: "text", width: 26 },
      { header: "Paket", kind: "text", width: 22 },
      { header: "Tanggal booking", kind: "date" },
      { header: "Acara", kind: "text", width: 16 },
      { header: "Nilai kontrak", kind: "money" },
      { header: "Dibayar", kind: "money" },
      { header: "Sisa", kind: "money" },
      { header: "Catatan", kind: "text", width: 30 },
    ],
    rows: vendors.map((vendor) => {
      const contract = vendor.expenses.reduce((sum, expense) => sum + expense.totalAmount, 0n);
      const settled = vendor.expenses.reduce((sum, expense) => sum + (paid.get(expense.id) ?? 0n), 0n);
      return [
        vendor.name,
        vendor.category.name,
        vendor.contactPerson,
        vendor.whatsapp,
        vendor.phone,
        vendor.instagram,
        vendor.website,
        vendor.packageName,
        date(vendor.bookingDate),
        vendor.eventLabel,
        contract,
        settled,
        contract - settled,
        vendor.notes,
      ];
    }),
  };
}

async function expensesTable(weddingId: string): Promise<ExportTable> {
  const db = getDb();
  const [expenses, paid] = await Promise.all([
    db.expense.findMany({
      where: { weddingId },
      orderBy: [{ category: { sortOrder: "asc" } }, { dueDate: { sort: "asc", nulls: "last" } }, { title: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        category: { select: { name: true } },
        vendor: { select: { name: true } },
        totalAmount: true,
        dueDate: true,
        notes: true,
      },
    }),
    paidByExpense(weddingId),
  ]);
  return {
    title: "Pengeluaran",
    columns: [
      { header: "Pengeluaran", kind: "text", width: 28 },
      { header: "Kategori", kind: "text", width: 20 },
      { header: "Vendor", kind: "text", width: 22 },
      { header: "Total", kind: "money" },
      { header: "Dibayar", kind: "money" },
      { header: "Sisa", kind: "money" },
      { header: "Status", kind: "text", width: 16 },
      { header: "Jatuh tempo", kind: "date" },
      { header: "Catatan", kind: "text", width: 30 },
    ],
    rows: expenses.map((expense) => {
      const settled = paid.get(expense.id) ?? 0n;
      const state = expensePaymentState(expense.totalAmount, settled);
      return [
        expense.title,
        expense.category.name,
        expense.vendor?.name ?? null,
        expense.totalAmount,
        settled,
        state.outstanding,
        EXPENSE_STATUS_LABEL[state.status],
        date(expense.dueDate),
        expense.notes,
      ];
    }),
  };
}

async function paymentsTable(weddingId: string): Promise<ExportTable> {
  const payments = await getDb().payment.findMany({
    where: { weddingId },
    orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      paymentDate: true,
      amount: true,
      method: true,
      reference: true,
      notes: true,
      expense: { select: { title: true, category: { select: { name: true } }, vendor: { select: { name: true } } } },
    },
  });
  return {
    title: "Pembayaran",
    columns: [
      { header: "Tanggal", kind: "date" },
      { header: "Pengeluaran", kind: "text", width: 28 },
      { header: "Kategori", kind: "text", width: 20 },
      { header: "Vendor", kind: "text", width: 22 },
      { header: "Nominal", kind: "money" },
      { header: "Metode", kind: "text", width: 16 },
      { header: "Referensi", kind: "text", width: 20 },
      { header: "Catatan", kind: "text", width: 30 },
    ],
    rows: payments.map((payment) => [
      date(payment.paymentDate),
      payment.expense.title,
      payment.expense.category.name,
      payment.expense.vendor?.name ?? null,
      payment.amount,
      PAYMENT_METHOD_LABEL[payment.method],
      payment.reference,
      payment.notes,
    ]),
  };
}

async function rundownTable(userId: string, weddingId: string): Promise<ExportTable> {
  const days = await listRundown(userId, weddingId);
  return {
    title: "Rundown",
    columns: [
      { header: "Tanggal", kind: "date" },
      { header: "Mulai", kind: "text" },
      { header: "Selesai", kind: "text" },
      { header: "Kegiatan", kind: "text", width: 28 },
      { header: "Deskripsi", kind: "text", width: 30 },
      { header: "PIC", kind: "text", width: 18 },
      { header: "Lokasi", kind: "text", width: 20 },
      { header: "Kategori", kind: "text", width: 16 },
      { header: "Catatan", kind: "text", width: 30 },
    ],
    rows: days.flatMap((day) =>
      day.items.map((item) => [day.dateIso, item.startTime, item.endTime, item.title, item.description, item.pic, item.location, item.category, item.notes]),
    ),
  };
}

/**
 * Builds one dataset for a member of the wedding, checking membership and access first (the same
 * rules as the page it comes from), and records the download in the activity log.
 */
export async function buildExport(userId: string, weddingId: string, dataset: ExportDataset, format: ExportFormat): Promise<ExportTable> {
  const membership = await requireWeddingFeature(EXPORT_DATASET_FEATURE[dataset], userId, weddingId);
  const id = membership.weddingId;
  const table =
    dataset === "guests"
      ? await guestsTable(id)
      : dataset === "vendors"
        ? await vendorsTable(id)
        : dataset === "expenses"
          ? await expensesTable(id)
          : dataset === "payments"
            ? await paymentsTable(id)
            : await rundownTable(userId, id);

  await recordActivity(getDb(), {
    weddingId: id,
    userId,
    actorName: membership.displayName,
    action: "data.exported",
    entityType: "export",
    metadata: { name: EXPORT_DATASET_LABEL[dataset], format: format.toUpperCase(), count: table.rows.length },
  });
  return table;
}

const MONEY_FORMAT = "#,##0";

function xlsxCell(value: ExportValue, column: ExportColumn) {
  if (value === null) return null;
  switch (column.kind) {
    case "money":
      // Whole rupiah stays far below 2^53, so the number is exact in a spreadsheet.
      return { value: Number(value), type: Number, format: MONEY_FORMAT };
    case "integer":
      return { value: Number(value), type: Number };
    case "date":
      return { value: new Date(`${String(value)}T00:00:00Z`), type: Date, format: "dd/mm/yyyy" };
    default:
      // Plain string cells: spreadsheet apps never evaluate them as formulas.
      return { value: String(value), type: String };
  }
}

export async function toXlsxBuffer(table: ExportTable): Promise<Buffer> {
  const header = table.columns.map((column) => ({ value: column.header, type: String, fontWeight: "bold" as const }));
  const rows = table.rows.map((row) => table.columns.map((column, index) => xlsxCell(row[index] ?? null, column)));
  return writeXlsxFile([header, ...rows], {
    sheet: table.title,
    columns: table.columns.map((column) => ({ width: column.width ?? (column.kind === "money" ? 16 : 12) })),
    stickyRowsCount: 1,
  }).toBuffer();
}
