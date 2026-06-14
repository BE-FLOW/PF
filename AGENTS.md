# PetFlow Agent Guide

## Product contract

- PetFlow organizes owner-provided observations; it does not diagnose or prescribe.
- Keep the core flow mobile-first: input, analyze, report, feedback.
- Prefer Korean user-facing copy and explicit text errors.
- In the v0.2 tester environment, collect only email, nickname, and a Korean mobile number with explicit purpose and retention notice. Do not collect location, address, or legal identity data.

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
