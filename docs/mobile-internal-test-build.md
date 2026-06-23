# 모바일 내부 테스트 빌드 런북

목표는 공개 출시가 아니라 인증된 테스터에게 설치 파일을 전달하고, 로그인부터
반려동물 등록, 건강 기록, 미디어 첨부, 병원 공유 요약, AI 초안까지 실제 기기에서
확인하는 것이다.

## 사전 확인

```bash
cd apps/mobile
npm install
npm run doctor
npm run expo:check
npm run typecheck
```

모바일 앱에는 공개 가능한 환경변수만 넣는다.

```text
EXPO_PUBLIC_API_BASE_URL=https://pf-two-eta.vercel.app
EXPO_PUBLIC_SUPABASE_URL=https://your-test-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

`OPENAI_API_KEY`, Supabase service role key, EAS 제출 키는 앱 번들에 넣지 않는다.

## Expo와 EAS 연결

```bash
cd apps/mobile
npx eas-cli login
npm run eas:init
```

자동화 환경에서는 `EXPO_TOKEN`을 설정한 뒤 같은 명령을 실행한다.

## Android 내부 테스트

빠른 설치 확인은 preview APK로 시작한다.

```bash
cd apps/mobile
npm run build:android:preview
```

2026-06-23 Android preview 빌드:

- 최신: https://expo.dev/accounts/beflow/projects/petflow-mobile/builds/886b35d9-d1ec-4c04-b766-5abeca5c79d2

이번 빌드는 로그인 후 화면을 `오늘 기록`, `기록·보고서`, `계정` 탭으로 나누고,
이미 반려동물이 있으면 등록 폼을 접어 긴 스크롤을 줄인다.

이 빌드는 EAS preview 환경의 `EXPO_PUBLIC_SUPABASE_URL`과
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 포함한다.

Google Play 내부 테스트 트랙에 올릴 때는 production 빌드를 사용한다.

```bash
npm run build:android:production
npm run submit:android
```

## iOS TestFlight

Apple Developer Program, App Store Connect 앱, 제출용 API 키가 준비된 뒤 실행한다.

```bash
cd apps/mobile
npm run build:ios:production
npm run submit:ios
```

## 내부 테스트 체크리스트

- 회원가입과 로그인
- 닉네임, 국내 휴대전화번호, 개인정보 동의 저장
- 반려동물 등록, 수정, 선택
- 오늘 건강 기록과 기본 안전 분류
- 사진과 동영상 첨부
- 같은 사건의 3일, 7일, 14일, 30일, 60일, 90일 경과 기록
- 병원 공유 요약과 기기 공유
- 참여코드 기반 AI 초안 생성
- AI 유용성, 만족도, 지불의향 피드백
- 계정 삭제 요청 접수
