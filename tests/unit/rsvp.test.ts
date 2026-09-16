import { describe, expect, it } from "vitest";
import { describeRsvp, RSVP_CHOICES, rsvpStatusLabel } from "@/lib/rsvp";
import { makeRsvpSchema, wishSchema } from "@/lib/validation/rsvp";

function form(overrides: Record<string, string> = {}) {
  return { rsvpStatus: "ATTENDING", attendingCount: "2", attendeeNames: "", message: "", ...overrides };
}

describe("RSVP choices", () => {
  it("never offers the planner-only pending state", () => {
    expect(RSVP_CHOICES).toEqual(["ATTENDING", "MAYBE", "DECLINED"]);
    expect(rsvpStatusLabel("PENDING")).toBe("Belum merespons");
  });

  it("describes what the guest already answered", () => {
    expect(describeRsvp("ATTENDING", 4)).toMatch(/hadir untuk 4 orang/);
    expect(describeRsvp("MAYBE", 0)).toMatch(/mungkin hadir/);
    expect(describeRsvp("DECLINED", 0)).toMatch(/berhalangan/);
    expect(describeRsvp("PENDING", 0)).toMatch(/belum mengonfirmasi/i);
  });
});

describe("makeRsvpSchema", () => {
  const schema = makeRsvpSchema(5);

  it("accepts an answer within the seat count", () => {
    const parsed = schema.parse(form({ attendingCount: "5", attendeeNames: " Ahmad, Siti ", message: " Selamat! " }));
    expect(parsed).toEqual({
      rsvpStatus: "ATTENDING",
      attendingCount: 5,
      attendeeNames: "Ahmad, Siti",
      message: "Selamat!",
    });
  });

  it("refuses more people than the invitation covers", () => {
    const result = schema.safeParse(form({ attendingCount: "6" }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["attendingCount"]);
    expect(result.error?.issues[0]?.message).toMatch(/melebihi 5 kursi/);
  });

  it("requires at least one person when attending", () => {
    expect(schema.safeParse(form({ attendingCount: "0" })).success).toBe(false);
  });

  it("zeroes the count when the guest cannot come", () => {
    expect(schema.parse(form({ rsvpStatus: "DECLINED", attendingCount: "3" })).attendingCount).toBe(0);
  });

  it("allows a maybe without a count", () => {
    expect(schema.parse(form({ rsvpStatus: "MAYBE", attendingCount: "" })).attendingCount).toBe(0);
  });

  it("rejects a status a guest may not choose and non-numeric counts", () => {
    expect(schema.safeParse(form({ rsvpStatus: "PENDING" })).success).toBe(false);
    expect(schema.safeParse(form({ attendingCount: "dua" })).success).toBe(false);
  });

  it("bounds the answer by the guest's own seat count", () => {
    expect(makeRsvpSchema(1).safeParse(form({ attendingCount: "2" })).success).toBe(false);
    expect(makeRsvpSchema(1).safeParse(form({ attendingCount: "1" })).success).toBe(true);
  });
});

describe("wishSchema", () => {
  it("requires a name and a message", () => {
    expect(wishSchema.safeParse({ name: "", message: "Selamat" }).success).toBe(false);
    expect(wishSchema.safeParse({ name: "Ahmad", message: "   " }).success).toBe(false);
    expect(wishSchema.parse({ name: " Ahmad ", message: " Selamat menempuh hidup baru " })).toEqual({
      name: "Ahmad",
      message: "Selamat menempuh hidup baru",
    });
  });

  it("caps the length of both fields", () => {
    expect(wishSchema.safeParse({ name: "a".repeat(81), message: "x" }).success).toBe(false);
    expect(wishSchema.safeParse({ name: "Ahmad", message: "x".repeat(1001) }).success).toBe(false);
  });
});
