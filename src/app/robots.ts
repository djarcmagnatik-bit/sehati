import type { MetadataRoute } from "next";
import { PRIVATE_PATH_PREFIXES } from "@/lib/auth/constants";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...PRIVATE_PATH_PREFIXES, "/reset-password", "/invite"],
      },
    ],
  };
}
