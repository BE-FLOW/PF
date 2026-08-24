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
데이터 소유권, AI 공정사용 한도와 저장 경로를 결정하지 않습니다.

## 비밀정보

서버에만 저장:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENAI_MODEL
FREE_AI_DAILY_LIMIT
```

앱과 브라우저에 공개 가능:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
EXPO_PUBLIC_API_BASE_URL
```

`service_role`, OpenAI 키, Expo 토큰, 스토어 제출 키는 Git과 앱 번들에 포함하지
않습니다. 공개 키도 RLS를 우회할 수 있다는 가정으로 사용하지 않습니다.
운영 `/api/health`는 `OPENAI_API_KEY`가 실제로 설정된 경우에만 무료 AI 생성을
활성 상태로 보고합니다. 마지막 무료판 migration marker까지 확인한
`freeReleaseSchema: ready`와 정확한 배포 커밋도 배포·스토어 사전 점검의 필수값입니다.

과거 결제 통합에 쓰던 `REVENUECAT_*`, `NEXT_PUBLIC_REVENUECAT_*`,
`EXPO_PUBLIC_REVENUECAT_*` 변수는 무료 공개판의 예제·배포·앱 빌드에 넣지 않습니다.
과거 원장과 재도입 검토 사항은 현재 운영 기준이 아닌
[`billing.md`](billing.md)에 격리합니다.

## 모바일 빌드 도구 보안 예외

Expo 57의 Metro 경로는 현재 `image-size@1.2.1`을 간접 의존하며, ICNS·HEIF·JPEG-XL
파서의 무한 루프 DoS 공지에는 패치 버전이 없습니다. 이 패키지는 설치 앱의 사용자
콘텐츠 처리 경로가 아니라 저장소 자산을 번들링하는 Node 빌드 도구에서만 사용됩니다.

- `apps/mobile/metro.config.js`에서 `icns`, `heif`, `jxl`, `jxl-stream` 파서를
  비활성화합니다. PetFlow 소스 자산은 이 형식을 사용하지 않습니다.
- 릴리스 테스트는 조작된 ICNS 헤더가 즉시 거부되는지 확인합니다.
- `npm audit fix --force`가 제안하는 Expo·React Native 강제 하향은 적용하지 않습니다.
- Expo가 패치된 Metro 의존성을 제공하면 우회 설정을 제거하고 모바일 감사를 다시
  실행합니다. 그 전까지 새 모바일 소스 자산은 신뢰한 PNG/JPEG만 받습니다.

## DB 변경

- 스키마 변경은 timestamp migration으로만 추가합니다.
- 원격 프로젝트의 `supabase_migrations.schema_migrations`와 로컬 파일을 일치시킵니다.
- 적용 전 백업과 dry-run을 확인하고, 적용 후 RLS·정책·제약을 역조회합니다.
- 운영 데이터 수정 쿼리는 대상 수를 먼저 확인하고 하나의 transaction에서 실행합니다.
- 사용자 원문이나 식별정보를 관리용 view와 일상 점검 쿼리에 노출하지 않습니다.

운영 배포 전 `supabase migration list --linked`로 모든 로컬 migration과 원격 이력이
일치하는지 확인합니다. Storage의 사용자·경로·반려동물·기록 소유권 조건과 AI 사용량,
과거 결제 원장 테이블의 서비스 역할 전용 접근을 역검증합니다. 과거 결제 테이블의
존재는 무료 앱의 권한이나 출시 조건으로 사용하지 않습니다.

새 클라이언트는 서버 서명 업로드를 사용합니다. 이미 설치된 버전은 소유자·반려동물·기록이 모두 일치할 때만 Storage RLS 호환 경로를 사용할 수 있습니다.

## 배포 순서

1. DB migration과 pgTAP 계약을 검토합니다.
2. `npm run verify:all`을 통과시킵니다.
3. DB migration을 적용하고 보안 조건을 역검증합니다.
4. 웹을 배포하고 `/api/health`를 확인합니다.
5. 같은 커밋으로 Android/iOS 스토어 빌드를 만듭니다.

현재 운영 절차는 [`operations.md`](operations.md), 모바일 제출 기준은
[`mobile-store-registration.md`](mobile-store-registration.md)를 따릅니다.
