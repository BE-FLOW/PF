# PetFlow

보호자가 반려동물의 변화를 빠르게 기록하고, 병원에 전달하기 좋은 사실 중심의
시간 흐름으로 정리하는 모바일 우선 서비스입니다. 진단이나 처방을 만들지 않습니다.

제품 판단은 [`docs/product-direction.md`](docs/product-direction.md), 데이터 취급은
[`docs/privacy-and-data.md`](docs/privacy-and-data.md)를 기준으로 합니다.
인프라 신뢰 경계는 [`docs/infrastructure.md`](docs/infrastructure.md), 반복 운영은
[`docs/operations.md`](docs/operations.md), 모바일 무료 공개 기준은
[`docs/mobile-store-registration.md`](docs/mobile-store-registration.md)를 따릅니다.
과거 결제 설계는 현재 비활성인 참고 자료로만
[`docs/billing.md`](docs/billing.md)에 격리되어 있습니다.

현재 사업 목표는 완전 무료 Android·iOS 공개판에서 기록부터 병원 전달본 공유까지
3분 안에 끝내고, 실제 병원 사용과 다음 방문 재사용 가능성을 확인하는 것입니다.
앱에는 상품·가격·구매·복원·결제 유도 화면이 없으며 자동 결제도 없습니다. 문서는
고정된 정답이 아니며 사용자 행동과 실사용 근거에 따라 제품 계약부터 갱신합니다.

## 구성

- Android/iOS: Expo React Native (`apps/mobile`)
- 보조 웹과 서버 API: Next.js App Router (`src`)
- 인증·데이터·비공개 파일: Supabase Auth, PostgreSQL RLS, Storage
- 병원 전달본: 인증된 Route Handler에서만 OpenAI 호출

브라우저와 앱은 데이터 소유권, AI 공정사용 한도, 파일 경로를 결정하지 않습니다.
서버와 RLS가 매 요청마다 계정 소유권과 사용 권한을 확인합니다.

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
npm run db:start
npm run verify:all
npm run verify:deployment -- https://pf-two-eta.vercel.app
```

`verify:all`은 실행 중인 로컬 Supabase의 pgTAP 계약까지 포함합니다. Windows에서 DB가
WSL2 Docker에 있으면 DB 단계만 `Ubuntu` WSL로 자동 위임하며, 다른 배포판은
`PETFLOW_WSL_DISTRO`로 지정할 수 있습니다. Docker 자체가 없는 환경에서는
`npm run verify:code`로 코드·모바일 검증을 먼저 실행하고 DB 검증은 CI나 Docker가 있는
환경에서 완료합니다. DB 변경은 마이그레이션과 `supabase/tests/database.test.sql`을
함께 수정합니다.
배포 순서는 DB 마이그레이션, 웹, Android/iOS 빌드 순입니다.
