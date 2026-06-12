# PetFlow Agent Guide

## Product contract

- PetFlow organizes owner-provided observations; it does not diagnose or prescribe.
- Keep the core flow mobile-first: input, analyze, report, feedback.
- Prefer Korean user-facing copy and explicit text errors.
- Do not collect email, phone number, location, or identity data in v0.1.

## Architecture

- Use Next.js App Router and TypeScript strict mode.
- Keep secrets and OpenAI calls in Route Handlers.
- Keep deterministic risk classification in `src/lib/analysis.ts`.
- Client persistence is limited to `localStorage` until authentication is intentionally added.

## Verification

- `npm run lint`
- `npm test`
- `npm run build`

## Guardrails

- Never expose `OPENAI_API_KEY` through `NEXT_PUBLIC_*` variables.
- Do not add disease diagnosis, medication names, dosing, or treatment plans.
- Do not introduce authentication, a database, or external analytics without a scoped product decision.
