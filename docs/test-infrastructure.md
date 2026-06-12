# 테스트 인프라

## 구성

| 영역 | 현재 설정 |
| --- | --- |
| Git | `BE-FLOW/PF`, 기본 브랜치 `main` |
| 배포 | Vercel `be-flow-s-projects/pf` |
| 고정 주소 | `https://pf-two-eta.vercel.app` |
| DB/Auth | Supabase `wxdbbwrevacnpshafdsp` |

`main`에 push하면 Vercel이 자동으로 테스트 주소를 갱신한다. 현재 이 주소는
상용 운영이 아닌 테스터 배포다.

## Vercel 환경변수

서버 전용:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY (선택)
OPENAI_MODEL (선택)
```

브라우저 공개 가능:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

`service_role` 키는 절대 `NEXT_PUBLIC_*`로 만들지 않는다.

## 배포 순서

1. migration을 Supabase 테스트 프로젝트에 적용한다.
2. `npm run lint`, `npm test`, `npm run build`를 실행한다.
3. 변경을 커밋하고 `main`에 push한다.
4. Vercel 배포가 `Ready`인지 확인한다.
5. 아래 명령으로 DB 쓰기까지 검증한다.

```bash
npm run verify:deployment -- https://pf-two-eta.vercel.app
```

## 상용 전 분리

실제 출시 전에는 Production Supabase 프로젝트와 도메인을 새로 만들고, 현재 DB와
테스터 계정을 운영 환경으로 자동 복사하지 않는다.
