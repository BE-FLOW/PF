# PetFlow Mobile

PetFlow의 Android/iOS 앱 준비 공간입니다. 현재 웹 테스트 배포를 유지하면서
Expo 기반 모바일 앱을 독립적으로 키우기 위해 루트 Next.js 앱과 분리했습니다.

## 시작 순서

```bash
cd apps/mobile
npm install
npm run start
```

Codex sandbox나 제한된 환경에서 Expo CLI가 사용자 홈에 텔레메트리 파일을 만들지
못하면 다음처럼 텔레메트리를 끄고 실행합니다.

```powershell
$env:EXPO_NO_TELEMETRY='1'
npm run start
```

## 환경변수

`.env.example`을 복사해 `.env`를 만들고 공개 가능한 값만 넣습니다.

```text
EXPO_PUBLIC_API_BASE_URL=https://pf-two-eta.vercel.app
EXPO_PUBLIC_SUPABASE_URL=https://your-test-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

`OPENAI_API_KEY`와 `SUPABASE_SERVICE_ROLE_KEY`는 모바일 앱에 넣지 않습니다.

## 다음 구현 순서

1. Supabase Auth 세션 연결
2. 반려동물 목록과 등록
3. 오늘 건강 기록 입력
4. 사진과 동영상 첨부
5. 병원 공유용 요약과 3일, 7일, 14일 경과 기록
