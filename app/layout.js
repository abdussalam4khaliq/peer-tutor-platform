import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import RegisterServiceWorker from "@/components/register-sw";
import InstallPrompt from "@/components/install-prompt";
import OfflineBanner from "@/components/offline-banner";
import AnalyticsProvider from "@/components/analytics-provider";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-mono",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://virtualcoursemate.com.ng";
const SITE_TITLE = "Coursemate: learn from the classmate who already aced it";
const SITE_DESCRIPTION =
  "Coursemate turns real lecture notes from top students into structured, department-specific courses.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "Coursemate",
  openGraph: {
    type: "website",
    siteName: "Coursemate",
    locale: "en_NG",
    url: "/",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Coursemate: learn from the classmate who already aced it" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16233D",
};

export const manifestUrl = "/manifest.json";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}>
        <RegisterServiceWorker />
        <OfflineBanner />
        <InstallPrompt />
        <Suspense fallback={null}>
          <AnalyticsProvider />
        </Suspense>
        {children}
      </body>
    </html>
  );
}