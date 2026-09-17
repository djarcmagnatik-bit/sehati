import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { PWA_THEME_COLOR, pwaIconPath } from "@/lib/pwa";
import { SITE } from "@/lib/site";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: `${SITE.name} — Wedding Planner untuk Berdua`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  icons: {
    icon: [{ url: pwaIconPath("192"), sizes: "192x192", type: "image/png" }],
    apple: [{ url: pwaIconPath("apple"), sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: SITE.name, statusBarStyle: "default" },
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: SITE.name,
    title: `${SITE.name} — Wedding Planner untuk Berdua`,
    description: SITE.description,
  },
  twitter: {
    card: "summary",
    title: `${SITE.name} — Wedding Planner untuk Berdua`,
    description: SITE.description,
  },
};

export const viewport: Viewport = {
  themeColor: PWA_THEME_COLOR,
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every page is rendered per request so Next.js can put the CSP nonce on its scripts (src/proxy.ts).
  await connection();
  return (
    <html lang="id" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <a href="#main" className="skip-link">
          Langsung ke konten
        </a>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
