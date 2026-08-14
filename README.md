# PetFlow

보호자가 반려동물의 변화를 빠르게 기록하고, 병원에 전달하기 좋은 사실 중심의
시간 흐름으로 정리하는 모바일 우선 서비스입니다. 진단이나 처방을 만들지 않습니다.

제품 판단은 [`docs/product-direction.md`](docs/product-direction.md), 데이터 취급은
[`docs/privacy-and-data.md`](docs/privacy-and-data.md)를 기준으로 합니다.
인프라 신뢰 경계는 [`docs/infrastructure.md`](docs/infrastructure.md), 반복 운영은
[`docs/operations.md`](docs/operations.md), 결제 원장과 출시 조건은
[`docs/billing.md`](docs/billing.md)를 따릅니다.

현재 사업 목표는 앱에서 기록부터 병원 전달까지 끝내고, 1회성 병원 전달본의
첫 스토어 결제와 재구매 가능성을 빠르게 검증하는 것입니다. 문서는 고정된 정답이
아니며 사용자 행동과 매출 근거에 따라 제품 계약부터 갱신합니다.

## 구성

- Android/iOS: Expo React Native (`apps/mobile`)
- 보조 웹과 서버 API: Next.js App Router (`src`)
- 인증·데이터·비공개 파일: Supabase Auth, PostgreSQL RLS, Storage
- 병원 전달본: 인증된 Route Handler에서만 OpenAI 호출

브라우저와 앱은 데이터 소유권, 결제 상태, 파일 경로를 결정하지 않습니다. 서버와
RLS가 매 요청마다 계정 소유권을 확인합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

모바일 앱은 별도 터미널에서 실행합니다.

```bash
cd apps/mobile
npm install
npm run start
```

환경변수는 `.env.example`과 `apps/mobile/.env.example`을 참고합니다.
`SUPABASE_SERVICE_ROLE_KEY`와 `OPENAI_API_KEY`는 서버에만 두며 Git이나 앱 빌드에
포함하지 않습니다.

## 검증

```bash
npm run verify:all
npm run verify:deployment -- https://pf-two-eta.vercel.app
```

DB 변경은 마이그레이션과 `supabase/tests/database.test.sql`을 함께 수정합니다.
배포 순서는 DB 마이그레이션, 웹, Android/iOS 빌드 순입니다.
