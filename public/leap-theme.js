/**
 * Leap theme bootstrap. Loaded by next/script with strategy="beforeInteractive"
 * from the root layout, so it runs before Next's own modules and before React
 * hydrates.
 *
 * It is deliberately a static file rather than an inline script: in the Next 16
 * App Router an inline <Script> is delivered through the Flight stream and only
 * runs at hydration, while a src'd one is preloaded in <head> and queued at the
 * top of <body>. No React component renders a raw <script> either way.
 *
 * The forced theme arrives as data-forced-theme on <html>, server-rendered from
 * FORCED_THEME in src/lib/theme/config.ts, so that stays the single source of
 * truth. While it is set this script only ever ADDS "dark" — nothing here can
 * take it off.
 *
 * Every storage read sits inside the try/catch: Safari in private mode throws
 * on localStorage access, and a throw here would leave the page unstyled.
 */
(function () {
  try {
    var d = document.documentElement;
    var forced = d.getAttribute("data-forced-theme");
    var choice = forced || localStorage.getItem("leap:theme") || "system";
    var resolved =
      choice === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : choice;
    if (resolved !== "dark" && resolved !== "light") {
      resolved = "dark";
    }
    d.classList.toggle("dark", resolved === "dark");
    if (localStorage.getItem("leap:solid-surfaces") === "1") {
      d.classList.add("solid");
    }
  } catch (e) {
    /* no storage access: fall back to whatever the server rendered */
  }
})();
