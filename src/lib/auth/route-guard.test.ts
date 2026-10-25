// Unit tests for the proxy's route decision. Runner: Node's built-in
// node:test via tsx — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AUTH_ROUTES, DASHBOARD_PREFIXES, decideRoute } from "./route-guard";

const SIGNED_OUT = false;
const SIGNED_IN = true;

describe("route lists", () => {
  it("are unchanged from the pre-proxy middleware", () => {
    assert.deepEqual(AUTH_ROUTES, ["/login", "/signup", "/forgot-password"]);
    assert.deepEqual(DASHBOARD_PREFIXES, [
      "/dashboard",
      "/jobs",
      "/resume",
      "/applications",
      "/chat",
      "/insights",
    ]);
  });

  // Pitfall 11: a recovery session is authenticated, so the reset page must
  // never be bounced; the OAuth/PKCE callback must never be guarded either.
  it("leave /auth/reset-password and /auth/callback out of both lists", () => {
    for (const path of ["/auth/reset-password", "/auth/callback"]) {
      for (const list of [AUTH_ROUTES, DASHBOARD_PREFIXES]) {
        assert.equal(
          list.some((p) => path.startsWith(p)),
          false,
          `${path} matched ${list.join(",")}`
        );
      }
    }
  });
});

describe("decideRoute — dashboard prefixes", () => {
  for (const prefix of DASHBOARD_PREFIXES) {
    it(`${prefix}: signed out goes to /login with next=${prefix}`, () => {
      assert.deepEqual(decideRoute(prefix, null, SIGNED_OUT), {
        action: "to-login",
        next: prefix,
      });
    });

    it(`${prefix}/sub/path: signed out keeps the full path in next`, () => {
      assert.deepEqual(decideRoute(`${prefix}/sub/path`, null, SIGNED_OUT), {
        action: "to-login",
        next: `${prefix}/sub/path`,
      });
    });

    it(`${prefix}: signed in is allowed`, () => {
      assert.deepEqual(decideRoute(prefix, null, SIGNED_IN), { action: "allow" });
    });
  }

  // A stray ?next= on a dashboard URL is not what gets remembered: the page
  // the user asked for is.
  it("ignores an incoming next param for signed-out dashboard requests", () => {
    assert.deepEqual(decideRoute("/jobs", "/elsewhere", SIGNED_OUT), {
      action: "to-login",
      next: "/jobs",
    });
  });
});

describe("decideRoute — auth routes", () => {
  for (const route of AUTH_ROUTES) {
    it(`${route}: signed in goes to /jobs by default`, () => {
      assert.deepEqual(decideRoute(route, null, SIGNED_IN), {
        action: "to-app",
        pathname: "/jobs",
      });
    });

    it(`${route}: signed out is allowed`, () => {
      assert.deepEqual(decideRoute(route, null, SIGNED_OUT), { action: "allow" });
    });
  }

  it("honours a safe internal next", () => {
    assert.deepEqual(decideRoute("/login", "/applications", SIGNED_IN), {
      action: "to-app",
      pathname: "/applications",
    });
  });

  it("routes a hostile next through safeNext", () => {
    for (const next of ["//evil.com", "/\\evil.com", "https://evil.com", "/\t/evil.com"]) {
      assert.deepEqual(
        decideRoute("/login", next, SIGNED_IN),
        { action: "to-app", pathname: "/jobs" },
        JSON.stringify(next)
      );
    }
  });

  // These pass safeNext but resolve to "//evil.com" once assigned to
  // url.pathname, which Next turns into an off-site Location (reproduced on
  // dev with next start before the fix).
  it("refuses a next that dot-segments its way to a protocol-relative path", () => {
    for (const next of [
      "/..//evil.com",
      "/.//evil.com",
      "/%2e%2e//evil.com",
      "/%2E%2E//evil.com",
      "/x/../..//evil.com",
      "/..//evil.com/path?q",
      // Next strips a /_next/data/<buildId>/…json wrapper when it re-parses
      // the Location; an empty buildId leaves "//evil.com".
      "/_next/data///evil.com.json",
      "/_next/data///evil.com/phish.json",
      "/x/../_next/data///evil.com.json",
      "/%2e/_next/data////datadata...json",
      "/_NEXT/data///evil.com.json",
    ]) {
      assert.deepEqual(
        decideRoute("/login", next, SIGNED_IN),
        { action: "to-app", pathname: "/jobs" },
        JSON.stringify(next)
      );
    }
  });

  // What the proxy does with the returned pathname, end to end: whatever
  // decideRoute returns must stay on the same origin after the setter.
  it("never returns a pathname that leaves the origin once applied", () => {
    const inputs = [
      "/..//evil.com", "/./..//evil.com", "/a/b/../../..//evil.com",
      "/%2e//evil.com", "/.%2e//evil.com", "/_next/data///evil.com.json",
      "/applications", "/jobs/../chat",
    ];
    for (const next of inputs) {
      const decision = decideRoute("/login", next, SIGNED_IN);
      assert.equal(decision.action, "to-app");
      if (decision.action !== "to-app") continue;
      const url = new URL("https://leap.example/login");
      url.pathname = decision.pathname;
      assert.equal(url.origin, "https://leap.example");
      assert.ok(!url.pathname.startsWith("//"), `${next} → ${url.pathname}`);
      assert.ok(!url.pathname.startsWith("/_next/"), `${next} → ${url.pathname}`);
    }
  });

  // Legitimate targets are returned untouched (zero behaviour change).
  it("returns safe targets exactly as safeNext did", () => {
    for (const next of ["/applications", "/jobs/../chat", "/resume?tab=1"]) {
      assert.deepEqual(decideRoute("/login", next, SIGNED_IN), {
        action: "to-app",
        pathname: next,
      });
    }
  });
});

describe("decideRoute — everything else is allowed in both states", () => {
  const open = [
    "/",
    "/dev/ui",
    "/auth/reset-password",
    "/auth/callback",
    // Not in DASHBOARD_PREFIXES: the dashboard layout redirects signed-out
    // users itself (without ?next=). Pinned so a change here is deliberate.
    "/profile",
  ];
  for (const path of open) {
    for (const hasUser of [SIGNED_OUT, SIGNED_IN]) {
      it(`${path} (${hasUser ? "signed in" : "signed out"})`, () => {
        assert.deepEqual(decideRoute(path, null, hasUser), { action: "allow" });
      });
    }
  }
});

// Existing behaviour carried over unchanged: matching is a bare startsWith,
// so a path that merely begins with a prefix is guarded too. Pinned so that
// tightening it is a deliberate, separate change.
describe("decideRoute — prefix matching is startsWith (unchanged)", () => {
  it("guards /jobsearch like /jobs", () => {
    assert.deepEqual(decideRoute("/jobsearch", null, SIGNED_OUT), {
      action: "to-login",
      next: "/jobsearch",
    });
  });

  it("treats /login-help as an auth route", () => {
    assert.deepEqual(decideRoute("/login-help", null, SIGNED_IN), {
      action: "to-app",
      pathname: "/jobs",
    });
  });
});
