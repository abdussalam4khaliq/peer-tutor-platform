import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import RegisterServiceWorker from "@/components/register-sw";
import InstallPrompt from "@/components/install-prompt";

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

export const metadata = {
  title: "Coursemate: learn from the classmate who already aced it",
  description:
    "Coursemate turns real lecture notes from top students into structured, department-specific courses.",
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
        <InstallPrompt />
        {children}
      </body>
    </html>
  );
}