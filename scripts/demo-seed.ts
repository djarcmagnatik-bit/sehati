/**
 * A complete demo wedding for showing the app: one couple account with Full Access and every
 * feature filled in (checklist progress, budget, vendors, payments, guests with RSVPs, a published
 * invitation with photos, rundown, calendar, savings, seserahan).
 *
 *   pnpm demo:seed -- --email demo@example.com            # (re)creates it; prints a new password once
 *   pnpm demo:seed -- --email demo@example.com --clean    # removes it
 *
 * Every name, address and account number is fictional. The script only ever modifies an account
 * whose name is DEMO_NAME, so it cannot overwrite or delete a real user.
 */
import { randomBytes } from "node:crypto";
import { config } from "dotenv";

config({ quiet: true });

const DEMO_NAME = "Akun Demo Sehati";
const M = 1_000_000n;

const emailIndex = process.argv.indexOf("--email");
const email = emailIndex > -1 ? process.argv[emailIndex + 1]?.trim().toLowerCase() : undefined;
const clean = process.argv.includes("--clean");

const GUESTS: Array<[name: string, group: string, seats: number, rsvp: "PENDING" | "ATTENDING" | "MAYBE" | "DECLINED", attending: number]> = [
  ["Bapak Hendra Wijaya", "Keluarga Mempelai Wanita", 2, "ATTENDING", 2],
  ["Ibu Sri Lestari", "Keluarga Mempelai Wanita", 2, "ATTENDING", 2],
  ["Om Bambang & Tante Wati", "Keluarga Mempelai Wanita", 4, "ATTENDING", 3],
  ["Keluarga Pak Darmawan", "Keluarga Mempelai Wanita", 4, "MAYBE", 0],
  ["Mbak Ratna", "Keluarga Mempelai Wanita", 1, "ATTENDING", 1],
  ["Bapak Surya Pratama", "Keluarga Mempelai Pria", 2, "ATTENDING", 2],
  ["Ibu Nurhayati", "Keluarga Mempelai Pria", 2, "ATTENDING", 2],
  ["Keluarga Pak Harun", "Keluarga Mempelai Pria", 5, "ATTENDING", 4],
  ["Mas Yoga", "Keluarga Mempelai Pria", 1, "PENDING", 0],
  ["Tante Lina", "Keluarga Mempelai Pria", 2, "DECLINED", 0],
  ["Dimas Saputra", "Teman", 2, "ATTENDING", 2],
  ["Sinta Maharani", "Teman", 1, "ATTENDING", 1],
  ["Rangga Aditya", "Teman", 2, "MAYBE", 0],
  ["Nadia Putri", "Teman", 1, "PENDING", 0],
  ["Fikri Ramadhan", "Teman", 1, "ATTENDING", 1],
  ["Ayu Kartika", "Teman", 2, "PENDING", 0],
  ["Bayu Firmansyah", "Rekan Kerja", 1, "ATTENDING", 1],
  ["Citra Anggraini", "Rekan Kerja", 1, "ATTENDING", 1],
  ["Pak Agus (Manajer)", "Rekan Kerja", 2, "ATTENDING", 2],
  ["Rina Oktaviani", "Rekan Kerja", 1, "DECLINED", 0],
  ["Tim Marketing", "Rekan Kerja", 6, "PENDING", 0],
  ["Alumni SMA 3 angkatan 2012", "Teman Sekolah / Kuliah", 8, "MAYBE", 0],
  ["Galih & Laras", "Teman Sekolah / Kuliah", 2, "ATTENDING", 2],
  ["Teman KKN Desa Sukamaju", "Teman Sekolah / Kuliah", 6, "PENDING", 0],
  ["Pak RT Sutrisno", "Tetangga", 2, "ATTENDING", 2],
  ["Ibu Warsini", "Tetangga", 1, "ATTENDING", 1],
  ["Keluarga Pak Joko", "Tetangga", 3, "PENDING", 0],
  ["Remaja Masjid Al-Ikhlas", "Organisasi", 5, "ATTENDING", 4],
  ["Komunitas Lari Pagi", "Organisasi", 4, "PENDING", 0],
  ["Bapak Kepala Dinas", "VIP", 2, "ATTENDING", 2],
];

/** A soft gradient "photo" (no real people): the app needs real image bytes for cover and gallery. */
async function placeholderPhoto(sharp: typeof import("sharp"), hueA: string, hueB: string, label: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hueA}"/><stop offset="1" stop-color="${hueB}"/></linearGradient></defs>
    <rect width="1600" height="1067" fill="url(#g)"/>
    <circle cx="1250" cy="260" r="220" fill="#ffffff" fill-opacity="0.18"/>
    <circle cx="330" cy="820" r="300" fill="#ffffff" fill-opacity="0.12"/>
    <circle cx="820" cy="530" r="120" fill="#ffffff" fill-opacity="0.10"/>
    ${label ? `<text x="800" y="560" font-family="Georgia, serif" font-size="64" fill="#ffffff" fill-opacity="0.85" text-anchor="middle">${label.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>` : ""}
  </svg>`;
  return sharp.default(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

/**
 * In the tools container this script runs as root, but the app runs as its own user. Files written
 * here are handed to the owner of the media directory itself, so the app can add to those folders.
 */
async function matchMediaOwnership(mediaDir: string) {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) return;
  const { chown, readdir, stat } = await import("node:fs/promises");
  const path = await import("node:path");
  const root = path.resolve(mediaDir);
  const { uid, gid } = await stat(root);
  if (uid === 0) return;
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      await chown(target, uid, gid);
      if (entry.isDirectory()) await walk(target);
    }
  };
  await walk(root);
}

async function main() {
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("usage: pnpm demo:seed -- --email <address> [--clean]");

  const { getDb } = await import("../src/server/db");
  const db = getDb();

  const existing = await db.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (existing && existing.name !== DEMO_NAME) {
    throw new Error(`${email} belongs to a real account (not "${DEMO_NAME}"); nothing was changed`);
  }
  if (existing) {
    await db.wedding.deleteMany({ where: { members: { some: { userId: existing.id } } } });
    await db.user.delete({ where: { id: existing.id } });
    console.log(`Removed the previous demo account ${email}.`);
  }
  if (clean) {
    await db.$disconnect();
    return;
  }

  const [
    { registerUser },
    { makeOnboardingSchema },
    { addDaysIso, todayIsoInTimeZone },
    { createWeddingForUser, updateCoupleNote },
    { adminGrantPlan },
    budget,
    vendors,
    { createGuest },
    invitation,
    { createWeddingEvent },
    content,
    { uploadImage },
    { submitRsvp },
    { submitWish },
    { setTaskCompleted },
    { createRundownItem },
    { createCalendarEvent },
    savings,
    { createGiftItem },
    { getEnv },
    sharp,
  ] = await Promise.all([
    import("../src/server/auth/auth-service"),
    import("../src/lib/validation/onboarding"),
    import("../src/lib/dates"),
    import("../src/server/wedding/wedding-service"),
    import("../src/server/billing/billing-service"),
    import("../src/server/budget/budget-service"),
    import("../src/server/vendors/vendor-service"),
    import("../src/server/guests/guest-service"),
    import("../src/server/invitation/invitation-service"),
    import("../src/server/invitation/event-service"),
    import("../src/server/invitation/content-service"),
    import("../src/server/media/media-service"),
    import("../src/server/rsvp/rsvp-service"),
    import("../src/server/rsvp/wish-service"),
    import("../src/server/checklist/task-service"),
    import("../src/server/planning/rundown-service"),
    import("../src/server/planning/calendar-service"),
    import("../src/server/planning/savings-service"),
    import("../src/server/planning/seserahan-service"),
    import("../src/lib/env"),
    import("sharp"),
  ]);

  const must = <T extends { ok: boolean }>(label: string, result: T): Extract<T, { ok: true }> => {
    if (!result.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`);
    return result as Extract<T, { ok: true }>;
  };

  // ─── Account and workspace ────────────────────────────────────────────────
  const password = randomBytes(12).toString("base64url");
  const account = must("register", await registerUser({ name: DEMO_NAME, email, password }));
  const userId = account.userId;
  const today = todayIsoInTimeZone(new Date());
  const weddingDate = addDaysIso(today, 150);
  const [eventType, marriageProcess] = await Promise.all([
    db.eventType.findUniqueOrThrow({ where: { code: "AKAD_RECEPTION" } }),
    db.marriageProcess.findUniqueOrThrow({ where: { code: "KUA" } }),
  ]);
  const onboarding = makeOnboardingSchema(today).parse({
    displayName: "Rizky",
    partnerName: "Anisa",
    brideName: "Anisa",
    groomName: "Rizky",
    coupleDisplayFormat: "BRIDE_GROOM",
    weddingDate,
    eventTypeId: eventType.id,
    marriageProcessId: marriageProcess.id,
    targetBudget: "150.000.000",
    currency: "IDR",
  });
  const { weddingId } = must("wedding", await createWeddingForUser(userId, onboarding));
  must("full access", await adminGrantPlan(weddingId, "FULL_ACCESS", { note: "Akun demo (data contoh)" }));
  await updateCoupleNote(userId, weddingId, "Jangan lupa: fitting kebaya Sabtu jam 10, bawa sepatu. Konfirmasi jumlah kursi ke catering H-14.");

  // ─── Checklist: finish the earliest tasks ────────────────────────────────
  const tasks = await db.task.findMany({ where: { weddingId }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], select: { id: true } });
  for (const task of tasks.slice(0, Math.round(tasks.length * 0.4))) await setTaskCompleted(userId, task.id, true);

  // ─── Budget ───────────────────────────────────────────────────────────────
  const categories = await db.budgetCategory.findMany({ where: { weddingId }, select: { id: true, name: true } });
  const category = (name: string) => {
    const found = categories.find((item) => item.name === name);
    if (!found) throw new Error(`budget category ${name} missing`);
    return found.id;
  };
  const allocations: Record<string, bigint> = {
    Venue: 35n * M, Catering: 40n * M, Dekorasi: 15n * M, Fotografi: 12n * M, Videografi: 8n * M, "Rias & Makeup": 8n * M,
    Busana: 10n * M, Cincin: 9n * M, Undangan: 3n * M, Souvenir: 4n * M, "Seserahan & Mahar": 6n * M,
  };
  for (const [name, allocatedAmount] of Object.entries(allocations)) {
    must(`allocate ${name}`, await budget.updateBudgetCategory(userId, category(name), { name, allocatedAmount }));
  }

  // ─── Vendors: booked (with contract, creates the expense) and researched ─
  const vendorCategories = await db.vendorCategory.findMany({ select: { id: true, code: true } });
  const vendorCategory = (code: string) => vendorCategories.find((item) => item.code === code)!.id;
  const booked: Array<[name: string, code: string, budgetName: string, contract: bigint, paid: bigint, packageName: string]> = [
    ["Gedung Serbaguna Melati", "VENUE", "Venue", 35n * M, 15n * M, "Paket gedung 6 jam"],
    ["Dapur Nusantara Catering", "CATERING", "Catering", 40n * M, 20n * M, "Buffet 400 pax + 4 gubukan"],
    ["Rumah Bunga Dekorasi", "DECORATION", "Dekorasi", 15n * M, 5n * M, "Dekor pelaminan + akad"],
    ["Lensa Cerita Studio", "PHOTOGRAPHY", "Fotografi", 12n * M, 12n * M, "Prewedding + hari H"],
    ["Ayu Pesona MUA", "MAKEUP", "Rias & Makeup", 8n * M, 3n * M, "Akad + resepsi, 2 kali ganti"],
  ];
  for (const [name, code, budgetName, contract, paid, packageName] of booked) {
    const vendor = must(`vendor ${name}`, await vendors.createVendor(userId, weddingId, {
      name, categoryId: vendorCategory(code), contactPerson: null, whatsapp: null, phone: null, instagram: null, website: null,
      packageName, bookingDate: addDaysIso(today, -30), eventLabel: null, notes: "Data contoh.", contractValue: contract,
      budgetCategoryId: category(budgetName), paymentDueDate: addDaysIso(weddingDate, -14),
    }));
    if (vendor.expenseId && paid > 0n) {
      must(`payment ${name}`, await budget.recordPayment(userId, vendor.expenseId, {
        amount: paid, paymentDate: addDaysIso(today, -20), method: "BANK_TRANSFER", reference: paid === contract ? "Lunas" : "DP", notes: null,
      }));
    }
  }
  const research: Array<[name: string, code: string, price: bigint, status: "RESEARCHING" | "CONTACTED" | "MEETING" | "SHORTLISTED", rating: number]> = [
    ["Sinema Rasa Films", "VIDEOGRAPHY", 9n * M, "SHORTLISTED", 5],
    ["Kilau Video", "VIDEOGRAPHY", 7n * M, "MEETING", 4],
    ["Suara Merdu Entertainment", "ENTERTAINMENT", 6n * M, "CONTACTED", 4],
    ["Souvenir Kayu Jati", "SOUVENIR", 4n * M, "RESEARCHING", 3],
  ];
  for (const [name, code, estimatedPrice, status, rating] of research) {
    must(`research ${name}`, await vendors.createVendorResearch(userId, weddingId, {
      name, categoryId: vendorCategory(code), contactPerson: null, whatsapp: null, phone: null, instagram: null, website: null,
      estimatedPrice, packageName: null, location: "Bandung", rating, pros: "Portofolio rapi", cons: null, notes: "Data contoh.",
      status, meetingDate: status === "MEETING" ? addDaysIso(today, 5) : null, meetingTime: status === "MEETING" ? "19:00" : null,
    }));
  }

  // ─── Other expenses ───────────────────────────────────────────────────────
  const rings = must("rings", await budget.createExpense(userId, weddingId, {
    title: "Cincin kawin (sepasang)", categoryId: category("Cincin"), vendorId: null, totalAmount: 9n * M, dueDate: null, notes: null,
  }));
  must("rings paid", await budget.recordPayment(userId, rings.expenseId, { amount: 9n * M, paymentDate: addDaysIso(today, -10), method: "CARD", reference: null, notes: null }));
  must("invitations", await budget.createExpense(userId, weddingId, {
    title: "Cetak undangan fisik 150 pcs", categoryId: category("Undangan"), vendorId: null, totalAmount: 2_500_000n, dueDate: addDaysIso(today, 20), notes: null,
  }));
  must("attire", await budget.createExpense(userId, weddingId, {
    title: "Kebaya akad + beskap", categoryId: category("Busana"), vendorId: null, totalAmount: 7_500_000n, dueDate: addDaysIso(today, 45), notes: null,
  }));

  // ─── Guests ───────────────────────────────────────────────────────────────
  const groups = await db.guestGroup.findMany({ where: { weddingId }, select: { id: true, name: true } });
  for (const [index, [guestName, group, seatCount, rsvpStatus, attendingCount]] of GUESTS.entries()) {
    must(`guest ${guestName}`, await createGuest(userId, weddingId, {
      guestName, invitationName: guestName, groupId: groups.find((item) => item.name === group)?.id ?? null,
      phone: null, email: null, address: null, seatCount, invitationStatus: index % 5 === 4 ? "NOT_SENT" : "SENT",
      rsvpStatus, attendingCount, notes: null,
    }));
  }

  // ─── Invitation ───────────────────────────────────────────────────────────
  await invitation.ensureInvitation(userId, weddingId);
  await invitation.updateInvitationTheme(userId, weddingId, { themeCode: "floral", coverLayout: "center" });
  const akad = addDaysIso(weddingDate, 0);
  await createWeddingEvent(userId, weddingId, {
    name: "Akad Nikah", eventDate: akad, startTime: "08:00", endTime: "10:00", venueName: "Masjid Raya Al-Ikhlas",
    address: "Jl. Contoh Raya No. 10, Bandung", latitude: -6.9175, longitude: 107.6191, mapsUrl: null, dressCode: "Putih / pastel", notes: "Mohon hadir 15 menit sebelum acara.",
  });
  await createWeddingEvent(userId, weddingId, {
    name: "Resepsi", eventDate: akad, startTime: "11:00", endTime: "14:00", venueName: "Gedung Serbaguna Melati",
    address: "Jl. Contoh Melati No. 25, Bandung", latitude: -6.9147, longitude: 107.6098, mapsUrl: null, dressCode: "Batik / formal", notes: null,
  });
  const sharpModule = sharp as unknown as typeof import("sharp");
  const photos: Array<[string, string, string]> = [
    // The cover gets no text: the invitation prints the names over it.
    ["#c98b8b", "#f3d9c7", ""],
    ["#8fa98b", "#e6efd9", "Prewedding"],
    ["#b99ac9", "#efe1f5", "Lamaran"],
    ["#d2a86e", "#f7ebd3", "Kebersamaan"],
    ["#7f9fbf", "#dfeaf5", "Hari bahagia"],
  ];
  const assetIds: string[] = [];
  for (const [index, [a, b, label]] of photos.entries()) {
    const bytes = await placeholderPhoto(sharpModule, a, b, label);
    assetIds.push(must(`photo ${index}`, await uploadImage(userId, weddingId, { name: `demo-${index}.jpg`, type: "image/jpeg", bytes })).assetId);
  }
  await matchMediaOwnership(getEnv().MEDIA_FILE_DIR);
  await invitation.setCoverImage(userId, weddingId, assetIds[0]!);
  for (const assetId of assetIds.slice(1)) await content.addGalleryImage(userId, weddingId, assetId);
  await content.createLoveStoryEntry(userId, weddingId, { title: "Pertama bertemu", timeLabel: "2019", story: "Kami bertemu di sebuah acara kampus. Obrolan singkat tentang buku berlanjut menjadi pertemanan yang hangat." });
  await content.createLoveStoryEntry(userId, weddingId, { title: "Mulai bersama", timeLabel: "2021", story: "Setelah dua tahun berteman, kami memutuskan untuk saling menemani lebih serius." });
  await content.createLoveStoryEntry(userId, weddingId, { title: "Lamaran", timeLabel: "2026", story: "Dengan restu kedua keluarga, lamaran berlangsung sederhana dan penuh haru." });
  await content.createGiftAccount(userId, weddingId, { type: "BANK", providerName: "Bank Contoh", accountNumber: "1234567890", accountHolder: "Anisa (contoh)", notes: "Contoh, bukan rekening asli" });
  await content.createGiftAccount(userId, weddingId, { type: "EWALLET", providerName: "Dompet Contoh", accountNumber: "081200000000", accountHolder: "Rizky (contoh)", notes: "Contoh, bukan nomor asli" });
  await content.updateGiftAddress(userId, weddingId, { giftAddress: "Jl. Contoh Mawar No. 5, Bandung (alamat contoh)" });

  const sections = await db.invitationSection.findMany({ where: { invitation: { weddingId } }, select: { id: true, type: true } });
  const sectionContent: Record<string, Record<string, string | null>> = {
    COVER: { prefix: "The Wedding Of", note: "Kami mengundang Bapak/Ibu/Saudara/i untuk hadir di hari bahagia kami." },
    COUPLE: {
      intro: "Dengan memohon rahmat dan ridha Allah SWT, kami bermaksud menyelenggarakan pernikahan putra-putri kami:",
      brideFullName: "Anisa Rahmawati", brideParents: "Putri dari Bapak Hendra Wijaya & Ibu Sri Lestari", brideInstagram: null,
      groomFullName: "Rizky Pratama", groomParents: "Putra dari Bapak Surya Pratama & Ibu Nurhayati", groomInstagram: null,
    },
    QUOTE: {
      text: "Dan di antara tanda-tanda kebesaran-Nya ialah Dia menciptakan pasangan-pasangan untukmu dari jenismu sendiri, agar kamu cenderung dan merasa tenteram kepadanya, dan Dia menjadikan di antaramu rasa kasih dan sayang.",
      source: "QS. Ar-Rum: 21",
    },
    CLOSING: {
      message: "Merupakan suatu kehormatan dan kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir dan memberikan doa restu.",
      signature: "Kami yang berbahagia, Anisa & Rizky",
    },
  };
  for (const section of sections) {
    if (sectionContent[section.type]) await invitation.updateSectionContent(userId, section.id, sectionContent[section.type]!, true);
    else await invitation.setSectionEnabled(userId, section.id, true);
  }
  const published = must("publish", await invitation.publishInvitation(userId, weddingId));

  // Guests answering through their personal links, and wishes on the invitation.
  const pending = await db.guest.findMany({ where: { weddingId, rsvpStatus: "PENDING" }, take: 3, orderBy: { createdAt: "asc" }, select: { invitationToken: true, seatCount: true } });
  for (const guest of pending) {
    must("rsvp", await submitRsvp(guest.invitationToken, { rsvpStatus: "ATTENDING", attendingCount: Math.min(2, guest.seatCount), attendeeNames: null, message: "Insya Allah hadir, selamat ya!" }));
  }
  const wishes: Array<[string, string]> = [
    ["Dimas & Sinta", "Selamat menempuh hidup baru! Semoga menjadi keluarga sakinah, mawaddah, warahmah."],
    ["Keluarga Pak Harun", "Barakallahu lakuma wa baraka alaikuma. Bahagia selalu untuk kalian berdua."],
    ["Teman kantor", "Selamat ya! Ditunggu undangan makan-makannya, semoga lancar sampai hari H."],
  ];
  for (const [name, message] of wishes) must("wish", await submitWish({ slug: published.slug }, { name, message }));

  // ─── Rundown, calendar, savings, seserahan ────────────────────────────────
  const rundown: Array<[title: string, start: string, end: string, pic: string, location: string, category: string]> = [
    ["Rias pengantin", "04:30", "07:00", "Ayu Pesona MUA", "Rumah mempelai wanita", "Persiapan"],
    ["Keluarga berangkat ke masjid", "07:15", "07:45", "Koordinator keluarga", "Rumah", "Persiapan"],
    ["Akad nikah", "08:00", "09:00", "Penghulu KUA", "Masjid Raya Al-Ikhlas", "Akad"],
    ["Sesi foto keluarga", "09:00", "10:00", "Lensa Cerita Studio", "Masjid Raya Al-Ikhlas", "Akad"],
    ["Ganti busana resepsi", "10:00", "10:45", "Ayu Pesona MUA", "Gedung Serbaguna Melati", "Resepsi"],
    ["Kirab & prosesi masuk", "11:00", "11:20", "MC", "Gedung Serbaguna Melati", "Resepsi"],
    ["Ramah tamah & makan siang", "11:20", "13:30", "Dapur Nusantara Catering", "Gedung Serbaguna Melati", "Resepsi"],
    ["Foto bersama tamu", "13:30", "14:00", "Lensa Cerita Studio", "Pelaminan", "Resepsi"],
  ];
  for (const [title, startTime, endTime, pic, location, category] of rundown) {
    await createRundownItem(userId, weddingId, { title, itemDate: weddingDate, startTime, endTime, description: null, pic, location, category, notes: null });
  }
  const agenda: Array<[string, number, string, string]> = [
    ["Fitting kebaya & beskap", 6, "10:00", "Butik Contoh"],
    ["Food tasting catering", 12, "13:00", "Dapur Nusantara Catering"],
    ["Technical meeting vendor", 130, "19:00", "Gedung Serbaguna Melati"],
  ];
  for (const [title, inDays, startTime, location] of agenda) {
    await createCalendarEvent(userId, weddingId, { title, eventDate: addDaysIso(today, inDays), startTime, endTime: null, location, notes: null });
  }
  await savings.updateSavingsSettings(userId, weddingId, { savingsTarget: 60n * M, savingsMonthlyTarget: 5n * M });
  const deposits: Array<[string, bigint, number]> = [["Rizky", 10n * M, -150], ["Anisa", 8n * M, -120], ["Rizky", 5n * M, -90], ["Anisa", 5n * M, -60], ["Rizky", 5n * M, -30]];
  for (const [contributor, amount, daysAgo] of deposits) {
    await savings.createSavingsEntry(userId, weddingId, { contributor, amount, entryDate: addDaysIso(today, daysAgo), account: "Tabungan bersama", notes: null });
  }
  const giftCategories = await db.giftCategory.findMany({ select: { id: true, code: true } });
  const giftCategory = (code: string) => giftCategories.find((item) => item.code === code)?.id ?? null;
  const seserahan: Array<[string, string, bigint, "PLANNED" | "PURCHASED" | "PACKED" | "READY"]> = [
    ["Set mukena & sajadah", "WORSHIP", 750_000n, "READY"],
    ["Al-Qur'an", "WORSHIP", 350_000n, "PACKED"],
    ["Kain batik & kebaya", "CLOTHING", 1_500_000n, "PURCHASED"],
    ["Sepatu & tas", "SHOES_BAGS", 1_200_000n, "PURCHASED"],
    ["Paket perawatan kulit", "COSMETICS", 900_000n, "PLANNED"],
    ["Aneka kue tradisional", "FOOD", 500_000n, "PLANNED"],
  ];
  for (const [name, code, estimatedPrice, status] of seserahan) {
    must(`seserahan ${name}`, await createGiftItem(userId, weddingId, {
      name, categoryId: giftCategory(code), quantity: 1, estimatedPrice, actualPrice: status === "PLANNED" ? null : estimatedPrice,
      responsible: "Keluarga mempelai pria", status, notes: null,
    }));
  }

  const appUrl = getEnv().APP_URL.replace(/\/+$/, "");
  const guestLink = await db.guest.findFirstOrThrow({ where: { weddingId }, orderBy: { createdAt: "asc" }, select: { invitationToken: true, guestName: true } });
  console.log(`
Demo wedding ready (all data is fictional).
  Login:        ${appUrl}/login
  Email:        ${email}
  Password:     ${password}          <- shown once; change it after logging in if you like
  Invitation:   ${appUrl}/undangan/${published.slug}
  Guest link:   ${appUrl}/i/${guestLink.invitationToken}   (${guestLink.guestName})
  Contents:     ${tasks.length} tasks (${Math.round(tasks.length * 0.4)} done), ${booked.length} booked vendors, ${research.length} vendor candidates,
                ${GUESTS.length} guests, ${photos.length} photos, 2 events, ${rundown.length} rundown items, ${seserahan.length} seserahan items
Remove it later with: pnpm demo:seed -- --email ${email} --clean`);
  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
