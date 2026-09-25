# UI/UX Enterprise Roadmap — Implementation Index

The full 12-phase plan lives in **[`0-12.md`](./0-12.md)**. The post-Phase-6 audit and phases 13-18 extension live in **[`UI_UX_ROADMAP_PHASE_0_6_AUDIT_AND_EXTENSION.md`](./UI_UX_ROADMAP_PHASE_0_6_AUDIT_AND_EXTENSION.md)** with the matching closeout in **[`PHASE_0_6_CLOSEOUT.md`](./PHASE_0_6_CLOSEOUT.md)**. This index points at the per-phase implementation history and tracks where the project sits in the plan.

---

## Status as of 2026-05-10 (post-audit closeout)

| Phase | Title | Status | Implementation history |
|---|---|---|---|
| **0** | Telemetry & Baselines | ✅ code-complete (3 external deploy steps pending) · static a11y scan: **0 findings** | [`docs/history/PHASE_0_IMPLEMENTATION.md`](./docs/history/PHASE_0_IMPLEMENTATION.md), [`docs/history/PHASE_0_1_4_IMPLEMENTATION.md`](./docs/history/PHASE_0_1_4_IMPLEMENTATION.md) |
| **1** | Design Tokens v3 | ✅ landed (OKLCH + contrast gate + tokens.json + `on-{state}-solid` tokens + density wired on AdminLayout) | [`docs/history/PHASE_1_2_IMPLEMENTATION.md`](./docs/history/PHASE_1_2_IMPLEMENTATION.md) |
| **2** | Component Library + Storybook | ✅ landed (all UI primitives + 6 pattern stories + design-tokens overview) | [`docs/history/PHASE_1_2_IMPLEMENTATION.md`](./docs/history/PHASE_1_2_IMPLEMENTATION.md) |
| **3** | Inline-Style Migration | ✅ 100% (51 instances, all truly-dynamic; `react/forbid-dom-props` is `error`) | [`docs/history/PHASE_3_PLAYBOOK.md`](./docs/history/PHASE_3_PLAYBOOK.md), [`docs/history/PHASE_3_PROGRESS.md`](./docs/history/PHASE_3_PROGRESS.md) |
| **4** | Information Architecture & Navigation | ✅ landed (IA map, breadcrumbs, cmd+K, route prefetch, View Transitions) | [`IA_MAP.md`](./IA_MAP.md), [`docs/history/PHASE_3_4_FINAL_IMPLEMENTATION.md`](./docs/history/PHASE_3_4_FINAL_IMPLEMENTATION.md) |
| **5** | States Library | ✅ 100% (skeletons, optimistic UI, taxonomy) | [`STATES_GUIDE.md`](./STATES_GUIDE.md) |
| **6** | Forms & Validation Excellence | ✅ 100% — **CheckoutPage now on RHF + Zod + shared `<Field>` primitive (post-audit closeout 2026-05-10)** | [`FORMS_GUIDE.md`](./FORMS_GUIDE.md), [`PHASE_0_6_CLOSEOUT.md`](./PHASE_0_6_CLOSEOUT.md) |
| **7** | Accessibility | ✅ **empirically verified passing (light + dark)** — 26/26 baselines clean across 13 routes × 2 themes, 0 critical/serious/moderate; 3 real bugs found and fixed during verification (offline.html retry-btn, preboot --muted, hp-gift-cta) | [`PHASE_7_9_CLOSEOUT_V4.md`](./PHASE_7_9_CLOSEOUT_V4.md), [`A11Y_REPORT.md`](./A11Y_REPORT.md) |
| **8** | Performance & CWV | ✅ **LCP gate empirically verified** — all critical routes under 2000ms in local perf snapshot; renderSeo noscript covers all 5 public route patterns; vite-ssg deferred per documented incompatibility | [`PHASE_7_9_CLOSEOUT_V4.md`](./PHASE_7_9_CLOSEOUT_V4.md) |
| **9** | Mobile-First & Cross-Device | ✅ **code complete (6/6)** — swipe-to-dismiss on CartDrawer + shared Modal primitive; container queries on cd-items + order-history-list; PWA install + share target + tablet viewport spec | [`PHASE_7_9_CLOSEOUT_V4.md`](./PHASE_7_9_CLOSEOUT_V4.md), [`TABLET_AUDIT.md`](./TABLET_AUDIT.md) |
| 10 | Microinteractions & Motion | ⬜ |  |
| 11 | Personalization | ⬜ |  |
| 12 | Continuous Quality Governance | ⬜ |  |
| 13-18 | Beyond-12 extension (i18n, security, resilience, search/merch, admin excellence, trust/conversion) | ⬜ (planned) | [`UI_UX_ROADMAP_PHASE_0_6_AUDIT_AND_EXTENSION.md`](./UI_UX_ROADMAP_PHASE_0_6_AUDIT_AND_EXTENSION.md) §§14-19 |

---

## What landed across phases 0–3

### Phase 0 — Observability + safety nets
- **RUM** via `web-vitals` → Cloud Function → Firestore `/rum` (admin-only, 90-day TTL)
- **Sentry** with replay (PII-redacted) + ErrorBoundary integration
- **Bundle budgets** in CI (size-limit, 7 chunks, PR comment)
- **Auth fixture for Playwright** (testLogin Cloud Function, triple-gated)
- **A11y CI workflow** + static pre-flight scan (`scripts/a11y-static-scan.mjs`)
- **Lighthouse CI** with extended URL coverage
- **Phosphor dropped** (was 0-import bundle bloat)

### Phase 1 — Design Tokens v3
Six new token tiers in `src/styles/tokens.css`:
- Distance · Elevation · Density · Fluid type · State surfaces · Data-viz palettes

Plus the system-driven `prefers-reduced-motion` override that retargets the **existing** `--dur-*` tokens (no parallel motion namespace — preserves the README's single-source-of-truth rule).

### Phase 2 — Storybook + Chromatic
- Storybook 8 with Vite, addon-a11y, addon-themes (theme switcher), viewport, interactions
- **9 story files, ~58 stories**: Button, Input, Card, Skeleton, Pagination, Toaster (Sonner), LazyImage, Select, Design Tokens
- Chromatic CI workflow
- Storybook stories excluded from `react/forbid-dom-props` lint (fixtures, not shippable code)

### Phase 3 — Inline-style migration (in progress)
- **Inline-style analyzer** (`scripts/inline-style-analyzer.mjs`) — buckets every instance, suggests utility classes, produces a per-file worklist
- **10 files migrated end-to-end** (or near it):
  - OrdersPage (37→1), PrivacyPolicyPage (18→0), AboutPage (7→0), RefundPolicyPage (23→0), ShippingPolicyPage (17→0)
  - ComboPairingPage (36→0), ContactCard (62→0 — 3 documented user-`style` pass-throughs), CartDrawer (62→1 — `--cd-progress`), CreditWidget (34→1 — `--cw-progress`)
- **Reusable class blocks** in `design.css`: `.ip-*` (4 info pages), plus per-component `cpp-*`, `cc-*`, `cd-*`, `cw-*` blocks. The `[data-open='true']` attribute-toggle pattern (cartDrawer panel + backdrop + chevron) is reusable for any other open/closed component.
- **Five JS-driven `onMouseEnter/onMouseLeave` hover handlers** converted to CSS `:hover` (playbook §step-4): category pills (ComboPairingPage), address/phone/WhatsApp/Instagram (ContactCard), tier buttons (CreditWidget).

Net Phase 3 progress: **1,704 → 1,315 raw matches** (−389, −22.8%); **ESLint warnings 1,536 → 1,270** (−266, −17.3%).

Honest bundle reality (gzipped, vs pre-migration baseline):
- main entry: 35.89 → 34.99 kB (−0.90 kB)
- css:        26.63 → 29.56 kB (+2.93 kB)
- net:        +2.03 kB

The ≥25 kB savings target the playbook hoped for hasn't materialized yet because we're at ~10% of file-count and each migrated component contributes its own CSS without cross-file deduplication. The deduplication payoff is downstream — when the 9 admin pages (heavy, static-token-only) land, their classes will share more, and net should turn negative.

---

## Verification (any phase, any time)

```bash
npx tsc --noEmit                                # 0 errors
cd functions && npx tsc --noEmit && cd ..       # 0 errors
npx eslint src tests functions/src --quiet      # 0 errors
npx stylelint "src/**/*.css"                    # 0 errors
npx vitest run                                  # 142 / 142
npm run build                                   # ~20 s
npm run size                                    # 7 / 7 within budget
npm run tokens:contrast                         # 21 / 21 pass WCAG AA
npm run tokens:export                           # writes design/tokens.json
npm run test:a11y:scan                          # static a11y findings
npm run build-storybook                         # ~38 s
```

All eleven commands have been green at every phase landing.

---

## What needs human action before deploy

These were intentionally NOT done in code because they require external setup:

| Item | What you do | Phase |
|---|---|---|
| Set `VITE_SENTRY_DSN` | Sign up at sentry.io, copy DSN, set in your build env | 0 |
| Set `ALLOW_TEST_LOGIN=1` on the test Firebase function | `firebase functions:config:set` on the **test** project (NOT prod) | 0 |
| Provision two Firebase Auth users for Playwright | `playwright-test-user` + `playwright-test-admin` (with `role: 'admin'` in their Firestore `users/` doc) | 0 |
| Add `CHROMATIC_PROJECT_TOKEN` GitHub secret | Sign up at chromatic.com, claim project, copy token | 2 |
| Re-baseline visual regression | Phase 1 token additions and Phase 3 migrations changed rendered output. Run `npm run test:visual:update` once after the first CI run, then commit the new `__screenshots__/`. | 1, 3 |

The CI workflows are written so a **fork** without those secrets sees the public test suite run cleanly (no failures, no errors), with the auth-bearing projects skipping. When you want full coverage, set the secrets and they activate automatically.

---

## What's next

Phase 4 has started but isn't finished. Next focused round:
- Wire breadcrumbs into `TeaProfilePage`, `OrdersPage`, `AccountPage`, `/admin/*`.
- Build predictive prefetching (`usePrefetchOnHover` + Navbar wiring).
- Live tea search inside cmd+K (Firestore subscription).
- Navigation-tree audit (the IA-map spreadsheet exercise).

Phase 3 still needs more inline-style migration (currently 22% complete vs the 100% goal). Both can run in parallel — Phase 3 is per-file mechanical work, Phase 4 is feature work.
