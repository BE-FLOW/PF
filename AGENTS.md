# PetFlow Agent Guide

## Product contract

- Read `docs/product-direction.md` before changing product behavior or data models.
- Treat every existing requirement and document as a hypothesis. Recheck it against the
  current product contract, observed user friction, and free-release validation goal.
- PetFlow turns owner observations into a factual timeline and hospital handoff; it does
  not diagnose or prescribe.
- Keep the core flow app-first: record, organize, share, and continue automatically.
- Do not add manual flow completion, scheduled follow-up entry, or repeated data entry.
- Until a new paid-release decision is recorded, prioritize the free public mobile release,
  hospital handoff completion, real hospital use, and repeat-use signal over broad platform
  features, dashboards, web parity, or monetization work.
- Prefer Korean user-facing copy and explicit text errors.
- Collect only identity data required for sign-in and service delivery. Do not require a
  phone number, location, address, or legal identity without a new scoped decision.

## Architecture

- Use Next.js App Router and TypeScript strict mode.
- Treat the Expo Android/iOS app as the primary product and the Next.js web as a support
  surface and authenticated server API.
- Keep secrets and OpenAI calls in Route Handlers.
- Keep deterministic risk classification in `src/lib/analysis.ts`.
- Use Supabase Auth and RLS for account, pet, and health data. Keep only non-sensitive UI convenience state in `localStorage`.
- Keep source and review status separate when adding loop data. Owner-reported hospital guidance is not expert-confirmed.
- Prefer episode-linked records over unrelated one-off summaries.
- Keep the current free release independent from Apple, Google, and RevenueCat purchase
  state. If paid functionality is reintroduced later, verify receipts on the server and
  never unlock it from a client-provided flag, participation code, or external payment.

## Verification

- `npm run verify:all`

## Guardrails

- Never expose `OPENAI_API_KEY` through `NEXT_PUBLIC_*` variables.
- Do not generate disease diagnoses, medication names, dosing, or treatment plans. Owner-reported hospital guidance may be stored but must not be marked expert-confirmed.
- Do not present AI-generated content as veterinarian-confirmed information.
- Do not add external analytics, model training on user data, or new identity fields without a scoped product decision.
- Keep record ownership, editing, deletion, and basic export outside the payment wall.
- Do not include purchase SDK execution, billing permissions, paywalls, prices, restore
  controls, or paid claims in the current free public app and store metadata. Reintroducing
  any of them requires a new scoped product decision and matching verified store paths.
