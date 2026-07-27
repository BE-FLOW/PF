# 운영 검증 절차

## 배포 경로

웹은 `https://pf-two-eta.vercel.app`, Android와 iOS는 각 스토어의 현재 배포
경로만 안내합니다. Google/Apple 로그인을 기본으로 사용하고, 기존
이메일·비밀번호 계정은 복구용 보조 경로로 유지합니다. 서비스 안내와 요청 대응을
위한 국내 휴대전화번호는 명시적 동의 후 입력합니다.

## 매일 확인

1. Vercel 최신 배포 상태가 `Ready`인지 확인합니다.
2. `/api/health`의 `database`가 `connected`, `billing`이 `configured`인지
   확인합니다.
3. `supabase/management.sql`의 집계 쿼리로 계정·반려동물·기록 수를 확인합니다.
4. 도움이 되지 않았다는 기록·AI 피드백을 우선 검토합니다.
5. `billing_events`의 `failed` 상태와 환불 후 남은 이용권 회수 여부를 확인합니다.

## 변경 관리

- 사용자 기능은 작게 나누어 변경합니다.
- 배포 전 `npm run verify:all`을 통과시킵니다.
- DB 변경은 새 migration과 pgTAP 계약을 함께 추가합니다.
- 비밀키와 실제 사용자 식별정보는 커밋하지 않습니다.
- 배포 후 스토어 설치본과 웹에서 핵심 흐름을 확인합니다.

## 계정 검증

- Google/Apple 신규 가입이 같은 Supabase 프로젝트에 세션과 프로필을 생성하는지 확인합니다.
- 기존 이메일 계정은 로그인 후 명시적인 연결 동작으로만 OAuth identity를 묶습니다.
- 이미 다른 계정이 소유한 identity는 연결을 거부하고 기록을 병합하지 않습니다.
- 로그아웃은 세션과 민감한 로컬 상태를 비우고 로그인 화면으로 돌아갑니다.
- 탈퇴는 비공개 파일과 Auth 사용자를 삭제한 뒤 연결된 DB 행이 제거됐는지 확인합니다.

## 더미 데이터 정리

`scripts/cleanup-dummy-data.mjs`는 기본적으로 dry-run입니다.

```bash
npm run db:cleanup:dummy -- --env-file=.env.local
```

삭제가 필요한 경우에만 검토한 동일 결과에 `--apply`를 붙입니다.

```bash
npm run db:cleanup:dummy -- --env-file=.env.local --apply
```

자동 대상은 `example.com`, `example.net`, `example.org`, `.test`, `.invalid`,
`localhost`처럼 실제 메일을 받을 수 없는 예약 도메인 계정뿐입니다. 표시 이름이나
메일 주소 일부가 `test`, `dummy`, `demo`라는 이유만으로 삭제하지 않습니다.

## 장애 시

- DB 또는 인증 장애 중에는 기록 저장과 AI 생성을 중단하고 명확한 오류를 표시합니다.
- 결제 확인이 지연되면 결제 성공을 단정하지 않고 `구매 내역 확인` 경로를
  제공합니다. 같은 거래를 수동으로 중복 지급하지 않습니다.
- 입력 중인 화면은 가능한 범위에서 유지하되 원문을 영구 브라우저 저장소에 남기지 않습니다.
- 배포 실패 시 직전 정상 배포를 유지하고 원인을 수정한 새 변경으로 복구합니다.
