# AI 요약 결제

## 상품

- 상품 ID: `petflow_ai_summary_1`
- 이름: `AI 병원 전달 요약 1회`
- 유형: 자동 갱신 없는 소모성 1회 상품
- 기본 가격 가설: 1,900원에 가장 가까운 스토어 가격
- 첫 AI 요약 1회는 계정당 무료

원문 기록, 수정·삭제, 기본 정리와 공유는 결제와 분리합니다. 유료 상품은 사용자가
고른 기록을 AI가 수의사 검토용 사실 초안으로 정리하는 1회 실행만 추가합니다.

## 플랫폼

- iOS와 Android는 각 스토어의 인앱결제만 사용합니다.
- 웹은 RevenueCat Billing 웹 결제를 사용합니다.
- 앱에서 웹 결제를 안내하거나 연결하지 않습니다.
- 모든 경로는 Supabase 사용자 UUID를 RevenueCat App User ID로 사용합니다.
- 로그인 전 구매와 익명 사용자 구매를 허용하지 않습니다.
- RevenueCat의 거래 양도 동작은 원래 App User ID에 구매를 유지하도록 설정합니다.
  OAuth 연결 뒤에도 Supabase 사용자 UUID가 같으므로 기록과 이용권이 함께 이어집니다.
- 소모성 상품에 스토어 복원 UI를 사용하지 않습니다. `구매 내역 확인`은 현재
  Supabase 계정의 RevenueCat 고객 정보와 서버 원장만 조용히 새로고침합니다.

## 서버 원장

`billing_purchases`는 검증된 외부 거래를, `billing_events`는 중복 가능한 결제
알림 결과를 보관합니다. `ai_credit_grants`와 `ai_credit_ledger`는 무료·구매
이용권의 지급, 사용, 실패 반환, 환불과 환불 취소를 기록합니다.

AI 생성 전 서버가 이용권 한 개를 예약합니다. 생성 실패나 5분 이상 멈춘 예약은
같은 이용권으로 반환합니다. 동일 거래와 동일 이벤트는 한 번만 처리됩니다. 환불
시 아직 사용하지 않은 이용권만 회수하며 이미 생성된 사용자 기록은 삭제하지
않습니다.

결제 직후 스토어 거래가 RevenueCat에 늦게 보이는 경우 앱이 자동으로 여러 번
확인하고, 이용권이 확인되면 사용자가 다시 누르지 않아도 요청하던 AI 요약을
이어 만듭니다. 계속 지연될 때만 `구매 내역 확인`을 보조 경로로 제공합니다.

앱의 결제 완료 반영은 `/api/billing/sync`가 RevenueCat 고객 정보를 확인하는
경로가 기본입니다. 따라서 웹훅이 잠시 지연돼도 정상 구매는 앱에서 복구할 수
있습니다. 다만 앱을 열지 않은 상태의 환불·취소를 자동 반영하려면 RevenueCat
웹훅을 운영 환경에 연결해야 합니다. 구매·환불 반영이 일시 실패하거나 환불
알림이 구매 알림보다 먼저 도착하면 서버는 성공으로 삼키지 않고 재시도 응답을
보냅니다.

`billing_purchases`는 웹훅이 제공하는 경우 구매 통화 금액, USD 환산 금액,
국가 코드, 세금·스토어 수수료 추정 비율을 함께 저장합니다. 카드번호나 결제수단
정보는 저장하지 않습니다.

## 매출 검증

`monetization_events`에는 다음 최소 흐름만 저장합니다.

- 구매창 열기·닫기
- 결제 시작·취소·실패·반영 지연
- 구매 내역 확인
- 생성한 AI 요약 공유

관찰 내용, 사진·영상, 이메일, 전화번호는 넣지 않습니다. 실제 결제 완료는
클라이언트 이벤트가 아니라 검증된 `billing_purchases`, 실제 AI 생성과 비용은
`ai_report_usage`를 기준으로 계산합니다. Supabase SQL Editor에서
`supabase/management.sql`을 실행하면 일별 구매창 진입, 구매, 반복 구매,
생성·공유, 매출과 AI 비용을 함께 확인할 수 있습니다.

계정 삭제 시 결제수단 정보가 아니라 PetFlow의 거래 식별자와 이용권 원장만
사용자 데이터와 함께 삭제합니다. 결제수단은 Apple·Google·웹 결제사가 관리합니다.

## 환경변수

서버:

```text
REVENUECAT_SECRET_API_KEY
REVENUECAT_WEBHOOK_AUTH_TOKEN
REVENUECAT_AI_SUMMARY_PRODUCT_ID=petflow_ai_summary_1
```

웹:

```text
NEXT_PUBLIC_REVENUECAT_WEB_API_KEY
NEXT_PUBLIC_REVENUECAT_AI_SUMMARY_PRODUCT_ID=petflow_ai_summary_1
```

앱:

```text
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
EXPO_PUBLIC_REVENUECAT_AI_SUMMARY_PRODUCT_ID=petflow_ai_summary_1
```

## 출시 조건

1. Apple Paid Apps 계약, 세금 및 은행 정보가 활성 상태입니다.
2. Google Payments 판매자 계정이 활성 상태입니다.
3. Apple·Google·RevenueCat Billing에 같은 상품 ID와 현지화 가격이 있습니다.
4. RevenueCat의 Apple·Google 앱 자격 증명과 웹 Stripe 계정이 연결돼 있습니다.
5. 현재 Offering에 1회 상품이 포함돼 있습니다.
6. RevenueCat 공개 키는 Vercel·EAS에, 비밀 키와 웹훅 토큰은 Vercel에 있습니다.
7. RevenueCat Pro 웹훅은 `/api/billing/revenuecat/webhook`으로 전송되며
   Authorization 값이 서버 토큰과 같습니다.
8. Apple Sandbox, Google 라이선스 테스터, 웹 테스트 결제에서 구매·취소·재시도·
   구매 내역 확인·AI 실패 반환을 검증했습니다.
9. 환불된 미사용 이용권은 회수되고, 이미 생성한 기록과 요약은 유지됩니다.

상품이나 키가 준비되지 않은 빌드에서는 결제 버튼을 숨기고 무료 이용권만
사용합니다. 가격은 코드에 고정하지 않고 스토어가 반환한 현지화 문자열만
표시합니다.

RevenueCat 웹훅은 Pro 플랜 기능입니다. 유료 출시 전에는 Pro 웹훅을 연결해
환불을 자동 반영하거나, 동일 수준의 환불 대조 운영 절차를 별도로 마련해야 합니다.

## Apple 상품 확인

```powershell
npm --prefix apps/mobile run configure:ios:iap
npm --prefix apps/mobile run status:ios:iap
```

두 명령은 `petflow_ai_summary_1`의 이름, 한국 가격, 판매 지역, 심사용 화면을
확인합니다. 상품 상태가 `READY_TO_SUBMIT`이어도 RevenueCat 연결과 새 네이티브
빌드가 끝나기 전에는 앱 심사에 첨부하지 않습니다.

최신 결제창을 실제 기기에서 캡처한 뒤 심사용 이미지를 교체할 때만 다음 명령을
사용합니다.

```powershell
node apps/mobile/scripts/configure-ios-iap.mjs --apply --replace-review-image --review-image <절대경로>
```

## Google 상품 확인

```powershell
npm --prefix apps/mobile run status:android:iap
npm --prefix apps/mobile run configure:android:iap
node apps/mobile/scripts/configure-android-iap.mjs --apply
```

첫 명령은 읽기 전용 상태 확인입니다. 두 번째 명령은 변경 예정 항목만 보여주며,
`--apply`가 있을 때만 `petflow_ai_summary_1`을 1,900원 기준의 단건 상품으로
생성하고 구매 옵션을 활성화합니다. 기존 상품은 자동으로 덮어쓰지 않습니다.

서비스 계정에는 대상 앱 보기와 `Manage store presence` 권한이 필요합니다.
실제 판매 전에는 Google Payments 판매자 프로필, 세금 및 지급 설정도 완료돼야
합니다. 설정 명령이 `결제 프로필이 앱에 연결되지 않았습니다`로 중단되면
Play Console의 결제 프로필을 먼저 연결한 뒤 같은 명령을 다시 실행합니다.
