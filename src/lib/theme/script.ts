import { FORCED_THEME, SOLID_KEY, THEME_KEY } from "./config";

/**
 * Theme bootstrap, injected by next/script with strategy="beforeInteractive"
 * from the root layout.
 *
 * It does NOT run before first paint, despite the strategy name. In the App
 * Router Next rewrites this into a `self.__next_s` queue entry and drains it
 * from app-bootstrap.js, so it executes after parse and paint, before
 * hydration. That is why the forced theme is server-rendered onto <html>
 * instead of relying on this script: the theme is right in the first frame
 * with or without JS. The Solid-surfaces class is not server-renderable (it
 * lives in localStorage, and reading a cookie would make every page dynamic),
 * so it does land late — see the PR body.
 *
 * Inline rather than a file in public/: the middleware matcher in
 * src/middleware.ts excludes _next/static and image extensions but not a .js
 * file served from public/, so a src'd script would put a Supabase
 * auth.getUser() round-trip in front of the asset on every page load — and on
 * an expired token, a second concurrent refresh. An inline script makes no
 * request at all. (src/middleware.ts is out of scope for this PR.)
 *
 * With FORCED_THEME = "dark" this resolves to "dark" and only ever *adds* the
 * class. Setting it to "light" would remove it, which is correct but worth
 * knowing: the add-only property belongs to the value, not the code.
 *
 * Every storage read sits inside the try/catch: Safari in private mode throws
 * on localStorage access, and a throw here would leave the page unstyled.
 */
/**
 * JSON.stringify leaves `<` and the JS line terminators alone, and this string
 * reaches the page through innerHTML, where `</script>` would close the tag.
 * The three inputs are compile-time constants today, so this is a guard on the
 * sink rather than a fix for a live hole.
 */
function toScriptLiteral(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function themeScript(): string {
  const forced = FORCED_THEME ? toScriptLiteral(FORCED_THEME) : "null";
  const themeKey = toScriptLiteral(THEME_KEY);
  const solidKey = toScriptLiteral(SOLID_KEY);

  return `(function(){try{var d=document.documentElement,f=${forced},t=f||localStorage.getItem(${themeKey})||"system",r=t==="system"?(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;if(r!=="dark"&&r!=="light"){r="dark"}d.classList.toggle("dark",r==="dark");if(localStorage.getItem(${solidKey})==="1"){d.classList.add("solid")}}catch(e){}})();`;
}
