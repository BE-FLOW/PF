# 인프라와 배포 신뢰 경계

## 운영 구성

| 영역 | 운영 대상 |
| --- | --- |
| Git | `BE-FLOW/PF`, 기본 브랜치 `main` |
| 웹 | Vercel `be-flow-s-projects/pf` |
| 고정 주소 | `https://pf-two-eta.vercel.app` |
| DB·Auth·Storage | Supabase `wxdbbwrevacnpshafdsp` |
| 모바일 | Expo EAS, `com.beflow.petflow` |

웹, Android, iOS는 같은 Supabase 운영 프로젝트와 서버 API를 사용합니다. 클라이언트는
데이터 소유권, AI 사용 권한, 결제 상태, 저장 경로를 결정하지 않습니다.

## 비밀정보

서버에만 저장:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENAI_MODEL
REVENUECAT_SECRET_API_KEY
REVENUECAT_WEBHOOK_AUTH_TOKEN
REVENUECAT_AI_SUMMARY_PRODUCT_ID
```

앱과 브라우저에 공개 가능:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
EXPO_PUBLIC_API_BASE_URL
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
NEXT_PUBLIC_REVENUECAT_WEB_API_KEY
```

`service_role`, OpenAI 키, Expo 토큰, 스토어 제출 키는 Git과 앱 번들에 포함하지
않습니다. 공개 키도 RLS를 우회할 수 있다는 가정으로 사용하지 않습니다.

결제 구성과 장애 대응은 [`billing.md`](billing.md)를 따릅니다.

## DB 변경

- 스키마 변경은 timestamp migration으로만 추가합니다.
- 원격 프로젝트의 `supabase_migrations.schema_migrations`와 로컬 파일을 일치시킵니다.
- 적용 전 백업과 dry-run을 확인하고, 적용 후 RLS·정책·제약을 역조회합니다.
- 운영 데이터 수정 쿼리는 대상 수를 먼저 확인하고 하나의 transaction에서 실행합니다.
- 사용자 원문이나 식별정보를 관리용 view와 일상 점검 쿼리에 노출하지 않습니다.

2026-07-23 기준 로컬에는 20개 migration이 있습니다. 운영 배포 전
`202607230002_harden_ai_credit_recovery.sql`까지 원격 이력과 일치하는지 확인하고,
Storage 정책 7개의 사용자·경로·반려동물·기록 소유권 조건과 결제 원장의
서비스 역할 전용 접근을 역검증합니다.

새 클라이언트는 서버 서명 업로드를 사용합니다. 이미 설치된 버전은 소유자·반려동물·기록이 모두 일치할 때만 Storage RLS 호환 경로를 사용할 수 있습니다.

## 배포 순서

1. DB migration과 pgTAP 계약을 검토합니다.
2. `npm run verify:all`을 통과시킵니다.
3. DB migration을 적용하고 보안 조건을 역검증합니다.
4. 웹을 배포하고 `/api/health`를 확인합니다.
5. 같은 커밋으로 Android/iOS 스토어 빌드를 만듭니다.

현재 운영 절차는 [`operations.md`](operations.md), 모바일 제출 기준은
[`mobile-store-registration.md`](mobile-store-registration.md)를 따릅니다.
