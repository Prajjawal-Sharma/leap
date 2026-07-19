import Link from "next/link";

const STEPS = [
  {
    number: "01",
    title: "Upload your resume",
    text: "Parsed and ATS-scored in seconds, so you know exactly how recruiters' software reads you.",
  },
  {
    number: "02",
    title: "Get your ranked feed",
    text: "Semantic embeddings compare what you've built against what each role needs — meaning over keywords.",
  },
  {
    number: "03",
    title: "Apply sharper",
    text: "Tailor your resume to any job description in one click and track every application in one place.",
  },
];

const FEATURES = [
  {
    icon: "feed",
    title: "Semantic job feed",
    text: "Every live role ranked by real fit to your experience — a recommendation engine, not a keyword search.",
  },
  {
    icon: "tailor",
    title: "One-click resume tailoring",
    text: "AI rewrites your resume for the specific job description before you apply.",
  },
  {
    icon: "gauge",
    title: "ATS scoring",
    text: "See your resume the way applicant tracking systems do, and fix the gaps before they cost you interviews.",
  },
  {
    icon: "chat",
    title: "AI career chat",
    text: "A copilot for the switch — aware of your profile, resume, and application pipeline.",
  },
] as const;

function FeatureIcon({ name }: { name: (typeof FEATURES)[number]["icon"] }) {
  const paths: Record<typeof name, React.ReactNode> = {
    feed: (
      <>
        <path d="M4 6h16" />
        <path d="M4 12h11" />
        <path d="M4 18h7" />
      </>
    ),
    tailor: (
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
    ),
    gauge: (
      <>
        <path d="M4 15a8 8 0 0 1 16 0" />
        <path d="M12 15l3.5-3.5" />
      </>
    ),
    chat: <path d="M4 5h16v10h-9l-5 4v-4H4V5z" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] font-sans text-white">
      {/* Decorative indigo glow behind the hero */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[40rem] max-w-full -translate-x-1/2 rounded-full bg-[#6366f1]/20 blur-3xl"
      />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="text-lg font-semibold text-[#6366f1]">
          Leap
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-md px-4 text-sm text-neutral-300 transition hover:bg-white/5 hover:text-white"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex min-h-11 items-center rounded-md bg-[#6366f1] px-4 text-sm font-medium text-white transition hover:bg-[#5458e0]"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 sm:px-6">
        {/* Hero */}
        <section className="flex flex-col items-center pb-20 pt-14 text-center sm:pb-28 sm:pt-24">
          <p className="rounded-full bg-white/5 px-3 py-1 text-xs text-neutral-300 ring-1 ring-white/10">
            Built for engineers at TCS, Infosys, Wipro &amp; beyond
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl md:text-6xl">
            Make the <span className="text-[#6366f1]">leap</span> from service
            to product.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-400 sm:text-lg sm:leading-8">
            Leap reads your resume and ranks every job by real fit — think
            YouTube recommendations, but for your career. No keyword stuffing,
            no scrolling through roles that were never for you.
          </p>
          <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[#6366f1] px-6 text-sm font-medium text-white transition hover:bg-[#5458e0] sm:w-auto"
            >
              Get started free
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md px-6 text-sm text-neutral-300 ring-1 ring-white/15 transition hover:bg-white/5 hover:text-white sm:w-auto"
            >
              Sign in
            </Link>
          </div>
          <p className="mt-5 text-xs text-neutral-500">
            3,000+ live roles from 25 product companies, refreshed daily.
          </p>
        </section>

        {/* How it works */}
        <section className="border-t border-white/10 py-16 sm:py-20">
          <h2 className="text-center text-2xl font-semibold sm:text-3xl">
            How it works
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-6">
            {STEPS.map((step) => (
              <div key={step.number} className="text-center sm:text-left">
                <p className="text-sm font-semibold tabular-nums text-[#6366f1]">
                  {step.number}
                </p>
                <h3 className="mt-2 text-base font-medium">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-white/10 py-16 sm:py-20">
          <h2 className="text-center text-2xl font-semibold sm:text-3xl">
            Everything you need to switch
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-6 text-neutral-400">
            One place to find the right roles, sharpen your resume, and keep
            your search on track.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl bg-neutral-900/60 p-6 ring-1 ring-white/10 transition duration-200 hover:-translate-y-0.5 hover:ring-white/20"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#6366f1]/15 text-[#a5a8f5] ring-1 ring-[#6366f1]/30">
                  <FeatureIcon name={feature.icon} />
                </div>
                <h3 className="mt-4 text-base font-medium">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  {feature.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="pb-16 pt-4 sm:pb-24">
          <div className="rounded-xl bg-neutral-900/60 px-6 py-10 text-center ring-1 ring-white/10 sm:py-12">
            <h2 className="text-2xl font-semibold sm:text-3xl">
              Ready to make the switch?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-neutral-400">
              Upload your resume and see your ranked feed in minutes — free
              during the beta.
            </p>
            <Link
              href="/signup"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-[#6366f1] px-6 text-sm font-medium text-white transition hover:bg-[#5458e0]"
            >
              Get started free
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-8 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left">
          <div>
            <p className="text-base font-semibold text-[#6366f1]">Leap</p>
            <p className="mt-1 text-xs text-neutral-500">
              Built for Indian software engineers making the switch.
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm text-neutral-400">
            <Link href="/login" className="transition hover:text-white">
              Sign in
            </Link>
            <Link href="/signup" className="transition hover:text-white">
              Create account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
