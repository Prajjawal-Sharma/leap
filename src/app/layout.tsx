import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

import { FORCED_THEME } from "@/lib/theme/config";
import { ThemeProvider } from "@/lib/theme/provider";
import { themeScript } from "@/lib/theme/script";

export const metadata: Metadata = {
  title: "Leap — AI job matching by real fit, not keywords",
  description:
    "Leap ranks every live role by how well it actually fits your resume — semantic matching, not keyword search. ATS scoring, one-click resume tailoring, an AI career chat that knows your profile, and one tracker for every application. Better-fitting roles, far less sorting.",
};

export const viewport: Viewport = {
  // While the theme is forced, the browser chrome has to be forced with it:
  // media-queried theme-colors follow the OS, so a user on a light OS would
  // get a light status bar wrapped around a dark page. The media queries come
  // back in PR 7, together with the toggle.
  themeColor: FORCED_THEME
    ? "#0F1115"
    : [
        { media: "(prefers-color-scheme: light)", color: "#F3F4F7" },
        { media: "(prefers-color-scheme: dark)", color: "#0F1115" },
      ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Server-rendering the forced theme is what guarantees a correct first
    // paint even with JS disabled; the pre-paint script only has to agree.
    // suppressHydrationWarning covers the classes that script adds (`solid`,
    // and `dark` once the theme is user-controlled).
    <html
      lang="en"
      className={`${FORCED_THEME ?? ""} h-full antialiased`.trim()}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Script id="leap-theme" strategy="beforeInteractive">
          {themeScript()}
        </Script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
