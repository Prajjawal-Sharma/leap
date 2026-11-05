import Link from "next/link";

// Any URL that matches no route. Rendered inside the root layout, so the theme
// and tokens apply. Plain markup on purpose: this boundary is part of every
// route's bundle, and the component kit would put Base UI and tailwind-merge
// on pages (the landing page, auth) that otherwise never load them.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-16">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center">
        <h1 className="text-title-3 text-foreground">This page does not exist</h1>
        <p className="max-w-[46ch] text-body-sm text-muted-foreground">
          The link may be old or mistyped.
        </p>
        <Link
          href="/"
          className="mt-1 inline-flex h-11 items-center rounded-sm bg-primary px-4 text-body-sm font-medium text-primary-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card md:h-9"
        >
          Go to Leap
        </Link>
      </div>
    </main>
  );
}
