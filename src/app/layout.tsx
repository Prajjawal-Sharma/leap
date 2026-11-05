import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";

import {
  FORCED_THEME,
  SOLID_COOKIE,
  THEME_COOKIE,
  htmlThemeState,
} from "@/lib/theme/config";
import { ThemeProvider } from "@/lib/theme/provider";

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
  // The mobile tab bar sits on env(safe-area-inset-bottom).
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Theme and Solid surfaces come from cookies, so the server renders the
  // right <html> attributes and the first paint is correct with or without
  // JS — no pre-paint script. Reading cookies makes the previously static
  // routes (the auth pages and /_not-found) render per request.
  const store = await cookies();
  const state = htmlThemeState(
    store.get(THEME_COOKIE)?.value,
    store.get(SOLID_COOKIE)?.value
  );

  return (
    // suppressHydrationWarning covers attributes browser extensions add to
    // <html>; the theme attributes themselves match between server and client.
    <html
      lang="en"
      className={`${state.className} h-full antialiased`.trim()}
      data-theme={state.dataTheme}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider initialTheme={state.theme} initialSolid={state.solid}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
