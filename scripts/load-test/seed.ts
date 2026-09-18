/**
 * Seeds the load-test dataset into the TEST database and writes .data/load-test/fixture.json.
 *
 *   pnpm load:seed [-- --couples 150 --guests 100 --big 10000]
 *   pnpm load:seed -- --clean          # remove the load-test accounts only
 *
 * Every couple gets Full Access, a published invitation with a cover photo, guests with personal
 * links and a session. Couple #0 gets `--big` guests (the PRD's 10,000). Accounts use @load.test
 * emails so they are easy to find and remove. Never touches the development database.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { FIXTURE_PATH, LOAD_EMAIL_DOMAIN, LOAD_MEDIA_DIR, LOAD_PASSWORD, type LoadFixture } from "./shared";

config({ path: ".env.test", quiet: true });
config({ quiet: true });

const testUrl = process.env["DATABASE_URL_TEST"];
if (!testUrl) throw new Error("DATABASE_URL_TEST belum diisi");
if (testUrl === process.env["DATABASE_URL"]) throw new Error("DATABASE_URL_TEST tidak boleh sama dengan DATABASE_URL");
process.env["DATABASE_URL"] = testUrl;
process.env["MEDIA_FILE_DIR"] = LOAD_MEDIA_DIR;

const arg = (name: string, fallback: number) => {
  const index = process.argv.indexOf(`--${name}`);
  const value = index > -1 ? Number(process.argv[index + 1]) : fallback;
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} must be a whole number`);
  return value;
};

async function main() {
  const { getDb } = await import("../../src/server/db");
  const db = getDb();

  const loadUsers = { email: { endsWith: `@${LOAD_EMAIL_DOMAIN}` } };
  // Weddings are not deleted with their members; remove them first.
  await db.wedding.deleteMany({ where: { members: { some: { user: loadUsers } } } });
  const removed = await db.user.deleteMany({ where: loadUsers });
  console.log(`Removed ${removed.count} earlier load-test account(s) and their weddings.`);
  rmSync(LOAD_MEDIA_DIR, { recursive: true, force: true });
  if (process.argv.includes("--clean")) {
    await db.rateLimitBucket.deleteMany({});
    await db.$disconnect();
    return;
  }

  const couples = arg("couples", 150);
  const guestsPerCouple = arg("guests", 100);
  const bigGuests = arg("big", 10_000);

  const [{ createOwnerWorkspace }, { createSession }, { ensureInvitation, getInvitationForUser, publishInvitation, updateSectionContent }, { createWeddingEvent }, { uploadImage }, { pngFixture }, { addDaysIso, todayIsoInTimeZone }] =
    await Promise.all([
      import("../../tests/support/workspace-helpers"),
      import("../../src/server/auth/session-service"),
      import("../../src/server/invitation/invitation-service"),
      import("../../src/server/invitation/event-service"),
      import("../../src/server/media/media-service"),
      import("../../tests/support/image-fixtures"),
      import("../../src/lib/dates"),
    ]);

  const started = performance.now();
  const today = todayIsoInTimeZone(new Date());
  const cover = pngFixture(1600, 1000, [180, 140, 120]);
  const fixture: LoadFixture = { createdAt: new Date().toISOString(), password: LOAD_PASSWORD, couples: [] };
  const tracker: string[] = [];

  for (let index = 0; index < couples; index += 1) {
    const { owner, weddingId } = await createOwnerWorkspace(tracker, { name: `Beban${index}`, weddingInDays: 200 });
    const email = `load-${index}@${LOAD_EMAIL_DOMAIN}`;
    await db.user.update({ where: { id: owner.userId }, data: { email } });

    await ensureInvitation(owner.userId, weddingId);
    await createWeddingEvent(owner.userId, weddingId, {
      name: "Resepsi",
      eventDate: addDaysIso(today, 200),
      startTime: "18:00",
      endTime: "21:00",
      venueName: "Gedung Serbaguna",
      address: "Jl. Merdeka No. 1, Bandung",
      latitude: null,
      longitude: null,
      mapsUrl: null,
      dressCode: null,
      notes: null,
    });
    const invitation = await getInvitationForUser(owner.userId, weddingId);
    const couple = invitation!.sections.find((section) => section.type === "COUPLE")!;
    await updateSectionContent(owner.userId, couple.id, { brideFullName: `Putri ${index}`, groomFullName: `Fajar ${index}` }, true);
    const upload = await uploadImage(owner.userId, weddingId, { name: "cover.png", type: "image/png", bytes: cover });
    if (!upload.ok) throw new Error(`cover upload failed: ${JSON.stringify(upload)}`);
    await db.invitation.update({ where: { weddingId }, data: { coverImageId: upload.assetId } });
    // RSVP and wishes are off by default; guests need them.
    await db.invitationSection.updateMany({ where: { invitationId: invitation!.id, type: { in: ["RSVP", "WISHES"] } }, data: { enabled: true } });
    const published = await publishInvitation(owner.userId, weddingId);
    if (!published.ok) throw new Error(`publish failed: ${JSON.stringify(published)}`);

    const group = await db.guestGroup.findFirstOrThrow({ where: { weddingId }, select: { id: true } });
    const guestCount = index === 0 ? Math.max(bigGuests, guestsPerCouple) : guestsPerCouple;
    const tokens: string[] = [];
    for (let offset = 0; offset < guestCount; offset += 1000) {
      const batch = Array.from({ length: Math.min(1000, guestCount - offset) }, (_, position) => {
        const token = randomBytes(16).toString("hex");
        tokens.push(token);
        const number = offset + position;
        return {
          weddingId,
          groupId: group.id,
          guestName: `Tamu ${number}`,
          invitationName: `Keluarga Bapak ${number}`,
          seatCount: 1 + (number % 4),
          invitationToken: token,
        };
      });
      await db.guest.createMany({ data: batch });
    }

    const session = await createSession(owner.userId, { remember: true });
    fixture.couples.push({ email, sessionToken: session.token, slug: published.slug, coverAssetId: upload.assetId, guestTokens: tokens.slice(0, 200), guestCount });
    if ((index + 1) % 25 === 0 || index + 1 === couples) console.log(`  ${index + 1}/${couples} couples`);
  }

  await db.rateLimitBucket.deleteMany({});
  await db.$executeRawUnsafe("ANALYZE");
  mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
  const guests = fixture.couples.reduce((sum, couple) => sum + couple.guestCount, 0);
  console.log(`Seeded ${couples} couples, ${guests} guests in ${Math.round((performance.now() - started) / 1000)} s → ${path.relative(process.cwd(), FIXTURE_PATH)}`);
  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
