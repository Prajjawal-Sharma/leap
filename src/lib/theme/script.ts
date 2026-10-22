import { FORCED_THEME, SOLID_KEY, THEME_KEY } from "./config";

/**
 * Source of the pre-paint theme bootstrap, injected by next/script with
 * strategy="beforeInteractive" from the root layout.
 *
 * Inline rather than a file in public/: the middleware matcher in
 * src/middleware.ts excludes _next/static and image extensions but not a .js
 * file served from public/, so a src'd script would put a Supabase
 * auth.getUser() round-trip in front of a head-preloaded asset on every page
 * load. An inline script makes no request at all. (src/middleware.ts is out of
 * scope for this PR; see the PR body.)
 *
 * While FORCED_THEME is set this resolves to that theme and only ever *adds*
 * the class — nothing here can take "dark" off the element.
 *
 * Every storage read sits inside the try/catch: Safari in private mode throws
 * on localStorage access, and a throw here would leave the page unstyled.
 */
export function themeScript(): string {
  const forced = FORCED_THEME ? JSON.stringify(FORCED_THEME) : "null";
  const themeKey = JSON.stringify(THEME_KEY);
  const solidKey = JSON.stringify(SOLID_KEY);

  return `(function(){try{var d=document.documentElement,f=${forced},t=f||localStorage.getItem(${themeKey})||"system",r=t==="system"?(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;if(r!=="dark"&&r!=="light"){r="dark"}d.classList.toggle("dark",r==="dark");if(localStorage.getItem(${solidKey})==="1"){d.classList.add("solid")}}catch(e){}})();`;
}
