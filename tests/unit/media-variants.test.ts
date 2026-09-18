import { describe, expect, it } from "vitest";
import { mediaPath, mediaSrcSet, parseImageVariants, pickVariantWidth } from "@/lib/media";

describe("responsive image helpers", () => {
  it("picks the narrowest copy that is wide enough, else the widest", () => {
    expect(pickVariantWidth([480, 960, 1280, 1920], 1082)).toBe(1280);
    expect(pickVariantWidth([480, 960, 1280, 1920], 300)).toBe(480);
    expect(pickVariantWidth([480, 960], 4000)).toBe(960);
    expect(pickVariantWidth([960, 480], 500)).toBe(960);
    expect(pickVariantWidth([], 800)).toBeNull();
  });

  it("builds paths and srcset only when copies exist", () => {
    expect(mediaPath("a")).toBe("/media/a");
    expect(mediaPath("a", 960)).toBe("/media/a?w=960");
    expect(mediaSrcSet("a", [960, 480])).toBe("/media/a?w=480 480w, /media/a?w=960 960w");
    expect(mediaSrcSet("a", [])).toBeUndefined();
  });

  it("ignores malformed variant rows", () => {
    expect(
      parseImageVariants([
        { width: 960, height: 720, byteSize: 10, storageKey: "k2" },
        { width: 480, height: 360, byteSize: 5, storageKey: "k1" },
        { width: "wide", height: 1, byteSize: 1, storageKey: "x" },
        null,
      ]).map((variant) => variant.width),
    ).toEqual([480, 960]);
    expect(parseImageVariants("[]")).toEqual([]);
  });
});
