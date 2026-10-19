# GeeksFinder UI/UX design guide

Single source of truth for how GeeksFinder looks, moves and speaks. Read before every UI change.

## Rules
- Tokens are law: no raw hex, pixel font sizes or ad-hoc shadows in components. Tokens live in `web/src/app/globals.css` (`@theme`).
- Real content only (sample data below), never lorem ipsum.
- One signature moment per page; everything else stays quiet.
- Every interactive element has hover, focus-visible, active, disabled and loading states.
- Mobile first: design at 375 px, then scale up.

## Brand
- Name: **GeeksFinder** — one word, capital G and F. Never "Geeks Finder", "GF", "geeksfinder".
- Wordmark: Schibsted Grotesk 700, `ink`, tracking -0.02em, a short `highlight` stroke under "Finder". No mascot, no gradient.
- Favicon: white "G" on `action`, 8 px radius at 32 px.
- Telegram bot: @GeeksFinderBot · channel: GeeksFinder Jobs.
- Audience: Indian final-year students/freshers, Android, mid-range phones, 4G, live in Telegram/WhatsApp, distrust scammy portals.
- Core promise: Wake up to jobs that fit your resume, and apply to each one with a resume that fits the job.
- Message order: 1) matched jobs every morning on Telegram 2) one-click resume tailoring 3) HR email in one click 4) ₹10 per 15 days, cancel from your UPI app.
- Personality: specific not hype · calm not urgent · honest (no guaranteed jobs) · plain English not HR jargon.
- **Signature: the highlighter.** A yellow mark showing where a resume meets a job — only on matched skills, newly tailored resume lines and the hero animation.

| Page | Primary action | Secondary |
|---|---|---|
| Landing | Upload your resume | See a sample alert |
| Onboarding | Connect Telegram | Choose alert time |
| Dashboard | Tailor resume for a job | Email HR |
| Pricing | Start 7-day free trial (autopay) | Stay on free plan |

## Anti vibe-coded rules
| Never | Instead |
|---|---|
| Purple/indigo gradient hero, blobs | Plain white page; hero is a real product moment |
| Scroll fade-ins on every section | One hero animation; elsewhere motion only responds to actions |
| Hover lift + shadow on cards | Hover changes border colour or one underline, only on clickable things |
| Identical rounded shadowed cards | Mix of flat rows, one framed panel, real UI |
| One coloured/italic word per headline | Whole headline one style |
| ALL-CAPS eyebrows | Headings stand alone |
| 01/02/03 on non-sequential content | Numbers only for the real 3-step flow |
| "→" after every button | Clear verb labels |
| Glassmorphism, glows, grain | Solid surfaces, 1 px borders |
| Emoji icons, mixed icon sets | Lucide only, 1.5 px stroke, 20 px |
| Fake testimonials/logos/"10,000+ users" | Only real numbers; real sample alert + before/after |
| "John Doe" | "Frontend Developer Intern · Zepto · Bengaluru" |
| Default shadcn look | Primitives restyled with tokens |
| Centre everything | Left-aligned, 12-col grid; centre only short CTAs |
| Dark mode default | Light by default |

Quality bar: would Razorpay/CRED/Zerodha ship this? If an element exists only to "look modern", remove it.

## Tokens
| Token | Hex | Use |
|---|---|---|
| paper | #FFFFFF | Page background |
| paper-2 | #F5F7FA | Section bands, input backgrounds |
| line | #E3E7ED | Borders, dividers |
| ink | #14213D | Headings, primary text |
| ink-2 | #4A5568 | Body text |
| ink-3 | #7A8494 | Captions, placeholders (large text only) |
| action | #2457D6 | Primary buttons, links, focus ring |
| action-dark | #1A44AE | Button hover / pressed |
| highlight | #FFE45C | Matched-skill highlighter |
| success | #16794C | Applied, payment success |
| warning | #B45309 | Payment pending, low quota |
| danger | #C0362C | Errors, failed payment |

Text on highlight is always ink. Never text on a gradient.

| Role | Font | Size/LH | Weight |
|---|---|---|---|
| Display (hero) | Schibsted Grotesk | 56/60 desktop, 38/42 mobile, -0.02em | 700 |
| H1 | Schibsted Grotesk | 40/46, mobile 30/36 | 700 |
| H2 | Schibsted Grotesk | 28/34, mobile 24/30 | 600 |
| H3 | Schibsted Grotesk | 20/28 | 600 |
| Body | Schibsted Grotesk | 16/26 | 400 |
| Small | Schibsted Grotesk | 14/20 | 400–500 |
| Resume text | Source Serif 4 | 14/22 | 400/600 |
| Article body | Source Serif 4 | 19/32 | 400 |
| Numbers | Schibsted Grotesk tabular | — | 600 |

Sentence case everywhere. Max line length 70ch.
Spacing 4,8,12,16,24,32,48,64,96,128. Section padding 96 desktop / 64 mobile.
Radius: inputs/buttons 10, panels 16, chips/highlighter 4.
Elevation 0: 1 px line border (default). Elevation 1: `0 1px 2px rgba(20,33,61,.06), 0 8px 24px rgba(20,33,61,.08)` — only floating UI (menus, toasts, hero phone).
Grid: 12 cols, 1200 max, 24 gutters; mobile 4 cols, 16 gutters. Dashboard: 240 px sidebar desktop, bottom tabs mobile.

## Motion
| Token | Duration | Easing | Use |
|---|---|---|---|
| instant | 100ms | ease-out | press, checkbox |
| quick | 180ms | cubic-bezier(0.2,0,0,1) | hover, tooltip, tab |
| standard | 280ms | cubic-bezier(0.2,0,0,1) | panels, accordions |
| emphasis | 450ms | cubic-bezier(0.16,1,0.3,1) | hero, success |
| spring | stiffness 400, damping 32 | spring | kanban, toasts |

Never > 500 ms for UI responses. Animate only transform, opacity, clip-path.
Hero (~4 s, once): 0.0 job card plain → 0.4 highlighter sweeps React, REST APIs, Git (450 ms each, 120 ms stagger) → 1.8 score counts 0→87 (600 ms) → 2.6 Telegram alert springs into phone "3 new matches for you" → 3.4 single focus-ring pulse on "Tailor resume". "Replay" text button; no looping.
Feedback: upload = progress bar then skill chips appear (60 ms stagger); tailor diff = new lines highlight yellow then settle over 1.2 s; save = icon → check (180 ms); Telegram connected = chip grey → green with check, no confetti; payment success = checkmark draws in; errors = danger border + message, 4 px shake only for wrong OTP.
No scroll fade-ins, scroll-jacking, parallax. Exception: sticky "How it works" crossfade.
Reduced motion: final frame instantly, crossfades < 150 ms, no hero sequence.

## Components (build first; pages use only these)
- **Button**: primary (action fill, white, 44 px / 48 mobile, r10, one per view), secondary (white, line border, ink), text (action, underline on hover), danger (danger text, border on hover). hover = action-dark; focus-visible = 2 px action ring offset 2; loading = spinner, fixed width; disabled = 40% opacity.
- **JobCard**: flat row desktop, stacked mobile. Company initial in 40 px paper-2 tile, title H3, company · city · posted in ink-3; up to 4 skill chips (matched = highlight); match score, Save icon, primary "Tailor resume", secondary "Email HR". Badges only: Fresher-friendly, Remote, Internship.
- **MatchScore**: "87% match", 600 tabular. ≥80 success, 60–79 ink, <60 hidden. Tooltip: "4 of 5 skills · Fresher role · Bengaluru".
- **Highlighter**: highlight bg, r4, -1deg skew pseudo-element, 2 px h-padding. Never the only signal (check icon + sr "matched").
- **TelegramAlertPreview**: neutral phone frame, "Good morning, Priya", 3 job rows with %, inline "Tailor resume" / "Open job".
- **ResumeDiff**: 2 columns desktop (Before / Tailored), toggle on mobile. Source Serif 4 on white A4 sheet, 1 px border. Old line struck in ink-3, new line highlighted. "Accept all", per-line "Undo", "Download PDF".
- **PricingBlock**: Free and Pro; Pro has 2 px action border. "₹10" large + "every 15 days". Under button: "7-day free trial · Autopay via UPI · Cancel anytime from your UPI app".
- **Tracker**: 5 columns Saved/Applied/Interview/Offer/Rejected, paper-2 bands, compact rows; mobile segmented control.
- **Toast**: bottom-centre mobile, bottom-right desktop, 4 s, verb-matched ("Resume tailored"). Empty state: one sentence + one button.

## Pages
Landing: navbar (wordmark; How it works, Pricing, Blog, FAQ; Log in; Upload your resume) → hero ("Wake up to jobs that fit your resume." / "Every morning, get fresher jobs matched to your skills on Telegram. Tailor your resume and email HR in one click." / Upload your resume · See a sample alert / "Free to start. No card needed.") → How it works (sticky, 3 steps) → Resume before/after ("Same you. Better fit for every job." + "We only rephrase what's already true. We never add skills you don't have.") → Alerts your way (interactive demo) → Pricing ("Less than a cup of chai every two weeks.") → FAQ (6) → CTA band ("Your next interview could start with tomorrow's alert.") → footer (Privacy, Terms, Refund policy, Contact, Telegram channel).
Onboarding: 4 steps with progress bar: upload → preferences → alerts (default 7:30 AM, Connect Telegram with live status chip) → done (first 5 matches).
Dashboard: sidebar/bottom tabs Matches, Tracker, Resumes, Alerts, Billing. Filter bar, "New today" divider, quiet usage strip for free users.
Billing: "Next debit ₹10 on 29 Oct" large, payment history, plain "How to cancel" steps + cancel button.
Blog: index = featured article + list rows (title, summary, topic, date), no stock thumbnails. Article = 680 px column, Source Serif 4 19/32, byline "GeeksFinder Desk, reviewed by <name>", "What this means for freshers" paper-2 box with left highlight bar, 3 live job rows, numbered sources.

## WhatsApp
- No WhatsApp logo. Write "WhatsApp"; Lucide message-circle only where an icon is needed.
- Pricing: two plans stay. Pro card has a checkbox row "Add WhatsApp alerts · +₹19" that switches the price to "₹29 every 15 days".
- Connect panel: like Connect Telegram. +91 phone field, consent checkbox with the exact consent copy, primary "Send code", then a 6-digit field and primary "Verify".
- Chip: grey "WhatsApp not connected" → success "WhatsApp connected"; warning "WhatsApp paused" with the fix.

## Admin
- Desktop-first shell, 240 px sidebar: Overview, Operations, Money, Growth, Content, System. Usable at 768 px; no mobile tabs.
- Numbers in tabular figures with the target in ink-3 beside them; warning or danger colour only when off target.
- Flat tables with sticky headers, sortable, 50 rows per page; phones always masked.
- Charts: Recharts with tokens, lazy-loaded in /admin only; lines for trends, bars for the funnel, no pies.
- Kill switches: danger text buttons with a type-to-confirm dialog.
- Empty: "No data yet" plus when data will appear.

## Copy
Helpful senior to junior. Sentence case. Buttons say what happens; toasts reuse the verb. Numbers over adjectives. Never promise outcomes. Money copy explicit. Errors say what happened + fix, no apology. No exclamation marks except after payment success.
Use: Matches, Tailor resume, Email HR, Cancel anytime from your UPI app, Fresher-friendly, Add WhatsApp alerts, WhatsApp connected, Send code, Verify, Switch to Pro from next cycle. Toasts: "Code sent", "WhatsApp connected", "WhatsApp alerts off", "Saved", "Sends paused", "Sends resumed". Avoid: Opportunities, Optimise with AI, Outreach, Hassle-free, Entry-level talent.

## Accessibility & performance
WCAG 2.2 AA; visible focus ring; 44×44 tap targets; real labels, aria-describedby for errors; reduced motion.
LCP < 2.5 s, INP < 200 ms, CLS < 0.1, landing JS < 170 KB gz, hero in HTML/CSS/SVG.

## Definition of done
Tokens only · checked at 375/768/1440 · no section-3 rule broken · all states · empty state · reduced motion · keyboard nav · Lighthouse perf ≥ 90 mobile, a11y 100 · copy follows rules.
