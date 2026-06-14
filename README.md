# PetFlow

반려동물의 관찰 기록을 쌓아 건강 흐름과 병원 상담용 요약을 만드는 모바일 우선 테스트 MVP입니다.

## Test environment

- App: https://pf-two-eta.vercel.app
- GitHub: https://github.com/BE-FLOW/PF
- Database: Supabase project `wxdbbwrevacnpshafdsp`
- Deployment: GitHub `main` push -> Vercel Production

현재 Production 주소는 실제 상용 서비스가 아니라 테스터에게 전달하는 고정 테스트 주소입니다.

## Local development

```bash
npm install
npm run dev
```

환경변수는 `.env.example`을 참고합니다. `SUPABASE_SERVICE_ROLE_KEY`와
`OPENAI_API_KEY`는 서버에서만 사용하며 Git에 저장하지 않습니다.

## Verification

```bash
npm run lint
npm test
npm run build
npm run verify:deployment -- https://pf-two-eta.vercel.app
```

운영 절차는 `docs/test-operations.md`, 개인정보 범위는
`docs/privacy-and-data.md`를 참고합니다.
