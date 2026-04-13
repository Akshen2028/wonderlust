import type { Metadata } from "next";
import Script from "next/script";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers";
import { AccessGate } from "@/components/access/AccessGate";
import { AppShell } from "@/components/layout/AppShell";
import { THEME_STORAGE_KEY } from "@/lib/constants";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Wonderlust — Travel planner",
  description: "Plan trips, curate itineraries, and track costs in one beautiful place.",
};

const themeInitScript = `
  (function() {
    try {
      var stored = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
      var theme = stored === "light" || stored === "dark"
        ? stored
        : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      document.documentElement.classList.toggle("dark", theme === "dark");
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${dmSans.variable} ${cormorant.variable} font-sans`}>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <AppProviders>
          <AccessGate>
            <AppShell>{children}</AppShell>
          </AccessGate>
        </AppProviders>
      </body>
    </html>
  );
}
