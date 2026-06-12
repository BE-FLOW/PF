# 테스트 DB와 Preview 배포

## 환경 구조

| 환경 | 앱 | 데이터베이스 |
| --- | --- | --- |
| Local | `localhost:3000` | Supabase local 또는 DB 미연결 로컬 저장 |
| Preview | Vercel Preview URL | `petflow-test` Supabase 프로젝트 |
| Production | 향후 운영 도메인 | 별도 `petflow-prod` 프로젝트 |

Preview와 Production이 같은 DB를 공유하지 않도록 한다. 현재 단계에서는 Supabase Branching 대신 고정 테스트 프로젝트 하나를 사용한다.

## 원격 저장 데이터

테스트 DB에는 다음 구조화 데이터만 저장한다.

- 설치별 익명 UUID
- 동물 종류, 품종, 생애주기
- 선택한 증상, 식욕, 활력, 지속 기간, 위험 신호
- 위험 단계와 점수
- 로컬 규칙 또는 OpenAI 사용 여부
- 앱 버전, Vercel 환경, 생성 시각
- 리포트 유용성 피드백

반려동물 이름, 생일, 성별, 체중, 자유 메모, 생성된 병원 요약 원문은 원격 DB에 저장하지 않는다.

## Supabase 테스트 프로젝트 설정

1. Supabase에서 `petflow-test` 프로젝트를 만든다.
2. SQL Editor에서 `supabase/migrations/202606120001_create_test_analytics.sql`을 실행한다.
3. Project Settings > API에서 Project URL과 `service_role` 키를 확인한다.
4. 키는 브라우저 코드나 `NEXT_PUBLIC_*` 환경변수에 넣지 않는다.

CLI를 사용할 경우:

```bash
npx supabase login
npx supabase link --project-ref <test-project-ref>
npx supabase db push
```

로컬 Supabase는 Docker가 설치된 환경에서 다음 명령으로 실행한다.

```bash
npm run db:start
npm run db:reset
npm run db:test
```

## Vercel Preview 설정

Vercel 프로젝트의 Preview 환경에만 다음 변수를 등록한다.

```text
SUPABASE_URL=https://<test-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<test-project-service-role-key>
OPENAI_API_KEY=<optional-test-key>
OPENAI_MODEL=gpt-5.4-mini
```

`main`이 아닌 브랜치 push 또는 Pull Request로 Preview URL을 생성한다. Production 환경변수에는 테스트 DB 키를 넣지 않는다.

## 배포 확인

```bash
npm run verify:deployment -- https://<preview-url>.vercel.app
```

이 명령은 다음을 확인한다.

1. `/api/health`에서 DB 연결 상태가 `connected`인지 확인
2. 개인정보 없는 테스트 리포트 생성 및 원격 저장
3. 해당 리포트에 테스트 피드백 저장

검증 데이터는 `health_reports.is_test = true`로 표시된다.

수동 테스트용 샘플 데이터는 `supabase/seed.sql`과
`docs/sample-data.md`에서 관리한다.

## 운영 전 체크

- 테스트 DB와 운영 DB의 URL 및 서비스 키가 다르다.
- Preview에는 테스트 키만 등록되어 있다.
- Production에는 운영 키만 등록되어 있다.
- `service_role` 키가 Git, 브라우저 번들, 로그에 노출되지 않는다.
- RLS가 켜져 있고 `anon`, `authenticated`에 테이블 권한이 없다.
