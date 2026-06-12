# 샘플 데이터 관리

`supabase/seed.sql`은 개인정보 없는 샘플 리포트 8건과 피드백 5건을 만든다.
같은 파일을 다시 실행해도 고정 UUID를 사용하므로 중복되지 않는다.

## 구분 방법

- `is_test = true`
- `app_version = seed-v1`
- `deployment_environment = seed`

Supabase Table Editor에서 `health_reports` 테이블에 위 필터를 적용하면 샘플만 볼 수 있다.

## 삭제

피드백은 외래 키의 `on delete cascade`로 함께 삭제된다.

```sql
delete from public.health_reports
where is_test = true
  and app_version = 'seed-v1';
```
