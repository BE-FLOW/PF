# PetFlow Agent Guide

## Product contract

- Read `docs/product-direction.md` before changing product behavior or data models.
- PetFlow connects owner observations, hospital sharing, reported or confirmed plans, and follow-up; it does not diagnose or prescribe.
- Keep the core flow mobile-first: observe, organize, share, follow up.
- Prefer Korean user-facing copy and explicit text errors.
- In the v0.2 tester environment, collect only email, nickname, and a Korean mobile number with explicit purpose and retention notice. Do not collect location, address, or legal identity data.

## Architecture

- Use Next.js App Router and TypeScript strict mode.
- Keep secrets and OpenAI calls in Route Handlers.
- Keep deterministic risk classification in `src/lib/analysis.ts`.
- Use Supabase Auth and RLS for account, pet, and health data. Keep only non-sensitive UI convenience state in `localStorage`.
- Keep source and review status separate when adding loop data. Owner-reported hospital guidance is not expert-confirmed.
- Prefer episode-linked records over unrelated one-off summaries.

## Verification

- `npm run lint`
- `npm test`
- `npm run build`

## Guardrails

- Never expose `OPENAI_API_KEY` through `NEXT_PUBLIC_*` variables.
- Do not generate disease diagnoses, medication names, dosing, or treatment plans. Owner-reported hospital guidance may be stored but must not be marked expert-confirmed.
- Do not present AI-generated content as veterinarian-confirmed information.
- Do not add external analytics, model training on user data, or new identity fields without a scoped product decision.
