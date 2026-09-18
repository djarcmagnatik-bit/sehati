/** Shared by the load-test seed and runner. */
import path from "node:path";

export const LOAD_EMAIL_DOMAIN = "load.test";
export const LOAD_PASSWORD = "rahasia-aman-123";
/** The load-test server stores and serves media from here (not the development store). */
export const LOAD_MEDIA_DIR = ".data/media-load";
export const FIXTURE_PATH = path.resolve(".data/load-test/fixture.json");

export type LoadFixture = {
  createdAt: string;
  password: string;
  couples: Array<{ email: string; sessionToken: string; slug: string; coverAssetId: string; guestTokens: string[]; guestCount: number }>;
};
