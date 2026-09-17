import { ImageResponse } from "next/og";
import { isPwaIconVariant, PWA_ICON_VARIANTS, PWA_BACKGROUND_COLOR, type PwaIconVariant } from "@/lib/pwa";

export const dynamicParams = false;

export function generateStaticParams(): Array<{ variant: PwaIconVariant }> {
  return (Object.keys(PWA_ICON_VARIANTS) as PwaIconVariant[]).map((variant) => ({ variant }));
}

/** The brand mark (two interlocking rings) rendered at build time; maskable icons keep a wide safe zone. */
export async function GET(_request: Request, { params }: { params: Promise<{ variant: string }> }): Promise<Response> {
  const { variant } = await params;
  if (!isPwaIconVariant(variant)) return new Response("Not Found", { status: 404 });
  const { size, maskable } = PWA_ICON_VARIANTS[variant];
  const mark = Math.round(size * (maskable ? 0.56 : 0.72));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: PWA_BACKGROUND_COLOR,
          borderRadius: maskable || variant === "apple" ? 0 : Math.round(size * 0.22),
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 32 32">
          <circle cx="12" cy="17" r="8" fill="none" stroke="#9d4f37" strokeWidth="2.5" />
          <circle cx="20" cy="15" r="8" fill="none" stroke="#4c5c43" strokeWidth="2.5" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } },
  );
}
