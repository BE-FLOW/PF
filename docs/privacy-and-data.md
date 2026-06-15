# 개인정보와 데이터 관리

## 수집 범위

필수:

- 로그인 이메일
- 테스터 닉네임
- 국내 휴대전화번호 (`010` 11자리)
- 개인정보 수집 동의 버전과 시각

선택:

- 연령대
- 반려 경험
- 반려동물 품종, 생일, 성별, 체중

수집하지 않음:

- 주소와 정확한 위치
- 실명 확인 정보
- 반려동물 등록번호

## 저장 위치

- 이메일과 인증: Supabase Auth
- 테스터 정보: `tester_profiles`
- 반려동물 프로필: `pets`
- 건강 사건과 진행 상태: `episodes`
- 구조화된 건강 통계: `health_reports`
- 병원에서 받은 계획: `episode_plans`, `plan_tasks`
- 3일·7일·14일 보호자 경과: `episode_progress_logs`
- 피드백: `health_report_feedback`

`episodes`에는 사건 식별자, 반려동물 연결, 진행 상태, 시작·최근 활동·종료
시각만 저장한다. `health_reports`에는 반려동물 이름, 생일, 자유 메모, 생성된
병원 요약 원문을 저장하지 않는다.

사건 단위 병원 전달 요약은 브라우저에서 구조화된 기록으로 즉시 만들며, 별도
공개 링크나 요약 원문을 서버에 저장하지 않는다. 사용자가 복사 또는 기기 공유를
직접 선택한 경우에만 기기의 공유 기능으로 전달한다.

전화번호는 서비스 안내와 테스트 관련 연락, 요청·장애 대응에만 사용한다.
광고·마케팅과 SMS 로그인에는 사용하지 않는다.

## 접근 통제

`pets`와 `tester_profiles`는 RLS가 활성화되어 있으며 로그인 사용자는 자신의
행만 조회·수정·삭제할 수 있다. 관리자 집계 뷰 `tester_management`는
`service_role`만 조회할 수 있다. `health_reports`, `episode_plans`, `plan_tasks`,
`episode_progress_logs`는 브라우저에서 직접 접근할 수 없고 소유권을 확인하는
Route Handler를 통해서만 조회·저장한다.

## 관리 화면

- 이메일과 가입 상태: Supabase Authentication > Users
- 테스터 연락처와 활동량: Table Editor > `tester_management`
- 반려동물: Table Editor > `pets`
- 리포트 통계: Table Editor > `health_reports`
- 사건별 병원 계획: Table Editor > `episode_plans`, `plan_tasks`
- 사건별 경과: Table Editor > `episode_progress_logs`
- 피드백: Table Editor > `health_report_feedback`

테스터 삭제 시 Auth 사용자를 삭제하면 테스터 프로필과 반려동물은 cascade로
삭제된다. 계정에 연결된 사건, 건강 기록, 병원 계획과 체크 항목도 함께 삭제된다.
경과 기록도 함께 삭제되며, 계정과 연결되지 않은 익명 테스트 통계는 영향을 받지
않는다.
