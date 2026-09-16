import { config } from "dotenv";
import { afterAll } from "vitest";

config({ path: ".env.test", quiet: true });
config({ quiet: true });

const testUrl = process.env["DATABASE_URL_TEST"];
if (!testUrl) {
  throw new Error("DATABASE_URL_TEST is required for integration tests (use a dedicated test database).");
}
if (testUrl === process.env["DATABASE_URL"]) {
  throw new Error("DATABASE_URL_TEST must differ from DATABASE_URL — integration tests write and delete data.");
}

process.env["DATABASE_URL"] = testUrl;
// Uploads from integration tests stay out of the development media store.
process.env["MEDIA_FILE_DIR"] = ".data/media-test";

afterAll(async () => {
  const { getDb } = await import("@/server/db");
  await getDb().$disconnect();
});
