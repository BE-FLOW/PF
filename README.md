# PetFlow

반려동물의 건강 변화를 기록하고 병원 방문용 요약을 만드는 모바일 우선 웹 MVP입니다.

## Run

```bash
npm install
npm run dev
```

`OPENAI_API_KEY`는 선택 사항입니다. 키가 없으면 내장 안전 규칙으로 전체 흐름이 동작합니다. OpenAI 연동을 사용할 때는 `.env.example`을 참고해 `.env.local`을 구성하세요.

Supabase 테스트 DB와 Vercel Preview 설정은 `docs/test-infrastructure.md`에 정리되어 있습니다. DB가 설정되지 않았거나 일시 실패해도 기록은 브라우저에 계속 저장됩니다.

## Verify

```bash
npm run lint
npm test
npm run build
```

제품 범위와 안전 원칙은 `docs/mvp-scope.md`에 정리되어 있습니다.
