# Phase 3 Feature Backlog

Features deferred to post-MVP / post-revenue. Do not build these during
Weeks 1-4 even if scope feels tempting. The MVP must ship first.

## Resume Builder + Chrome Extension

**What:** A full resume editor inside Leap with multiple ATS-friendly
templates, drag-drop section ordering, real-time PDF preview, and a
Chrome extension that injects "Tailor for this JD" on company career
pages and LinkedIn job posts.

**Why deferred:** Building a competitive resume builder (templates, PDF
generator with proper kerning, version history, mobile preview) is a 3-4
week build by itself, parallel to the actual product. Teal HQ already
owns this category with 100k+ users; competing on their turf with their
playbook is the wrong fight. Our differentiator is the semantic match
feed, not the resume builder.

**Dependencies (must exist before building this):**
- 50+ paying users on the core Leap product
- Validated tailored-resume usage on the existing one-click apply flow
  (Week 3 MVP feature) — proves users want resume tailoring at all
- Revenue justifying the build cost

**Inspiration / category research:**
- clearats.in — Indian ATS-focused builder with Chrome extension
- Teal HQ — gold standard for the category, $29/mo Pro tier
- Jobscan — ATS scoring focus, $50/mo

**Scope when we build it:**
- 5-8 ATS-friendly templates (start with Resume.io's ATS template set
  as reference for what passes scanners)
- Section editor (Personal, Experience, Education, Skills, Projects,
  Certifications, Custom)
- PDF + DOCX export
- Version history (each apply event creates a snapshot)
- Chrome extension: detect JD on LinkedIn / Greenhouse / Lever / Naukri,
  one-click "Tailor for this JD" pulls user's master resume + JD context
  into Leap and produces tailored output
- Theme picker (color, font, layout) but only within ATS-safe bounds
  (single-column, web-safe fonts, no graphics)

## (Add more deferred features here as they come up)