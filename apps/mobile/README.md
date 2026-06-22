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

## 현재 구현

- Supabase Auth 로그인/회원가입
- AsyncStorage 기반 세션 유지
- 테스터 필수 정보 저장: 닉네임, 국내 휴대전화번호, 개인정보 동의

## 다음 구현 순서

1. 반려동물 목록과 등록
2. 오늘 건강 기록 입력
3. 사진과 동영상 첨부
4. 병원 공유용 요약과 3일, 7일, 14일 경과 기록
