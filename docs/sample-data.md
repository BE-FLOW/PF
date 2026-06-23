# 샘플 데이터 관리

현재 tester DB와 로컬 reset에서는 샘플 데이터를 자동 생성하지 않는다. 실제 테스터
흐름은 회원가입, 반려동물 등록, 건강 기록 입력으로 확인한다.

이전에 사용하던 `seed-v1` 익명 샘플 리포트와 피드백은
`202606230002_cleanup_seed_and_profile_fields.sql` 마이그레이션에서 삭제한다.

필요할 때만 SQL Editor에서 아래 조건으로 남은 샘플을 확인한다.

```sql
select id, client_id, created_at
from public.health_reports
where is_test = true
  and app_version = 'seed-v1'
  and deployment_environment = 'seed';
```
