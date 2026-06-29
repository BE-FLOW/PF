# 테스트 운영 절차

## 테스터 전달

테스터에게는 `https://pf-two-eta.vercel.app`만 전달한다. 계정 연결은
Google/Apple 로그인을 기본으로 안내하고, 기존 이메일·비밀번호 계정은 보조
경로로만 사용한다. 서비스 안내와 테스트 연락을 위한 `010` 휴대전화번호는
명시적 동의 후 필수로 입력한다.

## 매일 확인

1. Vercel 최신 배포 상태가 `Ready`인지 확인한다.
2. `/api/health`의 `database`가 `connected`인지 확인한다.
3. Supabase `tester_management`에서 가입자·반려동물·리포트 수를 확인한다.
4. `health_report_feedback`의 `not-helpful` 피드백을 우선 검토한다.

## 변경 관리

- 한 번에 사용자 기능 하나만 변경한다.
- 배포 전 로컬 `lint`, `test`, `build`가 통과한 변경만 테스트 주소에서 확인한다.
- DB 변경은 새 migration 파일로 추가한다.
- 비밀키와 실제 테스트 이메일은 커밋하지 않는다.
- 배포 후 고정 테스트 주소에서 모바일 흐름을 확인한다.

Supabase SQL Editor에서 반복 조회할 쿼리는 `supabase/management.sql`에 있다.

## 장애 시

- DB 장애여도 익명 건강 기록은 브라우저 저장으로 계속 동작한다.
- 인증 장애 시 기존 익명 흐름은 유지한다.
- 배포 실패 시 Vercel의 직전 Ready 배포를 확인하고 원인을 수정한 뒤 다시 push한다.
