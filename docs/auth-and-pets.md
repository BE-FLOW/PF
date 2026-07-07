# 테스트 계정과 반려동물 관리

테스터는 Google 또는 Apple 계정으로 로그인하는 흐름을 기본으로 사용한다.
기존 이메일·비밀번호 계정은 보조 경로로 유지한다. 첫 로그인 뒤에는 최소
테스터 정보와 개인정보 수집 동의를 저장하고, 여러 종류의 반려동물을 등록해
한 마리를 선택한 다음 건강 기록을 남긴다.

## 테스트 환경 설정

- Google/Apple OAuth Provider와 Redirect URL을 Supabase Auth에 연결한다.
- 모바일 OAuth Redirect URL에는 `petflow://auth-callback`과
  `petflow:///auth-callback`을 모두 허용한다.
- 앱은 `AuthSession.makeRedirectUri({ scheme: "petflow", path: "auth-callback" })`로
  콜백을 만들고, 같은 콜백 URL이 두 번 들어와도 세션 교환은 한 번만 처리한다.
- 이메일·비밀번호 가입은 기존 테스트 계정 호환용 보조 경로로만 유지한다.
- 반려동물 데이터는 `public.pets`에 저장한다.
- RLS 정책으로 로그인 사용자는 본인 반려동물만 조회·수정·삭제할 수 있다.
- 테스트 연락용 국내 휴대전화번호만 명시적 동의 후 수집한다. 주소와 위치
  정보는 수집하지 않는다.

## 건강 기록 연결

로그인 상태에서 만든 리포트는 `health_reports.user_id`와
`health_reports.pet_id`에 계정과 선택된 반려동물이 연결된다. 관련 기록은
`health_reports.episode_id`로 진행 중인 `episodes` 행에 묶인다. 사용자가 사건을
마무리한 뒤 남기는 다음 기록은 새 사건을 자동 생성한다. 기존 익명 기록은 계정과
사건 연결 없이 계속 사용할 수 있다.

계정에 연결된 건강 기록은 사용자, 반려동물, 사건이 모두 같은 소유 관계여야 한다.
반려동물이나 사건을 삭제하면 연결된 건강 기록, 계획, 체크 항목도 함께 삭제된다.

## 병원 계획 연결

보호자가 병원에서 받은 안내는 사건별 `episode_plans` 한 건과 최대 5개의
`plan_tasks`로 저장한다. 출처는 `owner`, 확인 상태는 `user_reported`로 고정하며
PetFlow 안에서 수의사가 확인한 정보로 표시하지 않는다.

## 경과 기록 연결

같은 사건의 초기 3일·7일·14일 경과와 장기 30일·60일·90일 경과는
`episode_progress_logs`에 구조화해 저장한다. 각 시점에는 전반적인 변화, 식욕,
활력만 기록하며 자유 메모나 진단 정보는 받지 않는다. 병원 계획을 처음 저장한
날을 경과 기준일로 사용하고, 계획이 없으면 사건 시작일을 사용한다. 출처는
`owner`, 확인 상태는 `unreviewed`로 고정한다.

## 계정 삭제 요청

로그인한 테스터는 앱 또는 웹 계정 화면에서 계정 삭제 요청을 남길 수 있다. 요청은
`account_deletion_requests`에 저장하며 브라우저에서 직접 접근할 수 없다. 운영자는
`account_deletion_management`에서 요청자 이메일, 닉네임, 전화번호를 확인한 뒤
Supabase Authentication에서 Auth 사용자를 삭제한다. Auth 사용자 삭제 시 연결된
테스터 정보, 반려동물, 사건, 기록, 계획, 경과, GPT 권한과 피드백은 cascade로 함께
삭제된다.

## GPT 리포트 권한과 참여코드

수의사 검토용 GPT 리포트는 로그인만으로 열지 않는다. 관리자가 Supabase SQL
Editor에서 `create_ai_access_code(...)`를 실행해 참여코드를 만들고, 승인된
테스터가 계정 화면에 코드를 입력하면 `ai_access_grants`에 권한을 저장한다.
참여코드는 테스터 키처럼 운영한다. 원문 코드는 생성 직후 한 번만 공유하고,
DB에는 해시와 앞 6자리 prefix만 남긴다.

키마다 다음 값을 다르게 줄 수 있다.

- `target_label`: 파일럿 그룹, 병원, 내부 리뷰어 등 운영용 이름
- `target_max_redemptions`: 몇 명까지 같은 키를 사용할 수 있는지
- `target_monthly_report_limit`: 사용자별 월간 GPT 초안 생성 횟수
- `target_total_report_limit`: 사용자별 전체 생성 횟수
- `target_expires_at`: 만료일
- `disabled_at`: 회수 또는 일시 중지

권한이 있는 테스터만 사건별 GPT 리포트 API를 호출할 수 있다. 생성 시
`ai_report_usage`에 성공·실패, 모델, 토큰 사용량과 선택적 비용 추정값을 남긴다.
리포트 원문은 저장하지 않는다. 생성 후 테스터가 남기는 유용성 점수, 지불의향,
희망 가격, 짧은 의견은 웹과 모바일 모두 `/api/ai-report-feedback`를 통해
`ai_report_feedback`에 저장해 파일럿 판단에 사용한다.
