# PetFlow Mobile

PetFlow Android/iOS 앱은 하나의 Expo 소스와 같은 서버 API를 사용합니다. 웹과 앱의
핵심 흐름은 `관찰 → 정리 → 공유 → 경과 확인`으로 맞추고, 플랫폼별 차이는 로그인,
파일 선택, 공유처럼 운영체제가 제공하는 기능에만 둡니다.

## 시작

```bash
cd apps/mobile
npm install
npm run start
```

Expo CLI가 제한된 환경에서 telemetry 파일을 만들지 못하면 다음처럼 실행합니다.

```powershell
$env:EXPO_NO_TELEMETRY='1'
npm run start
```

## 환경 변수

`.env.example`을 복사해 `.env`를 만들고 공개 가능한 값만 넣습니다.

```text
EXPO_PUBLIC_API_BASE_URL=https://pf-two-eta.vercel.app
EXPO_PUBLIC_SUPABASE_URL=https://your-test-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

`OPENAI_API_KEY`, Supabase service role key, 스토어 제출 키는 모바일 앱에 넣지 않습니다.

## 구현 범위

- Google/Apple 계정 로그인, 기존 이메일 계정 보조 로그인
- AsyncStorage 기반 세션 유지
- 테스터 필수 정보 저장: 닉네임, 국내 휴대전화번호, 개인정보 동의
- 반려동물 목록, 등록, 수정, 선택
- 오늘 건강 기록 입력, 수정, 삭제, 기본 안전 분류
- 사진/동영상 첨부와 최근 기록에서 확인
- 병원 공유용 요약, 기기 공유
- 병원에서 받은 안내 체크리스트
- 3일, 7일, 14일, 30일, 60일, 90일 경과 기록
- 로그인 사용자용 AI 병원 요약과 사용자 피드백
- 계정 삭제 요청 접수

## 배포 원칙

1. 수정 중에는 스토어 빌드를 만들지 않고 웹과 `main`을 계속 갱신합니다.
2. 코드 동결 후 웹 배포 커밋과 모바일 빌드 커밋이 같은지 사전검증합니다.
3. Android 비공개 테스트, Android 정식 출시, iOS TestFlight, iOS 심사 후보를
   서로 다른 명령으로 실행합니다.
4. `OPENAI_API_KEY`, Supabase service role key, 스토어 제출 키는 앱에 넣지 않습니다.

## 검증과 상태 확인

```bash
cd apps/mobile
npm run verify
npm run release:preflight:android
npm run release:preflight:ios
npm run status:ios
```

사전검증은 앱 버전과 식별자, 스토어 자산, 제출 키, EAS 로그인, 깨끗한 `main`,
`origin/main` 동기화, 운영 웹과 DB 상태, 웹 배포 커밋 일치를 확인합니다.

## 채널별 배포

```bash
cd apps/mobile

# Google Play 비공개 테스트
npm run release:android:closed

# Google Play 정식 트랙
npm run release:android:production

# 외부 TestFlight
npm run release:ios:testflight

# App Store Connect 심사 후보 업로드
npm run release:ios:review-candidate

# 심사 메타데이터와 스크린샷 갱신
npm run prepare:ios:app-store
npm run upload:ios:screenshots
```

`release:ios:testflight`는 새 iOS 빌드를 App Store Connect에 업로드하고
`PetFlow 보호자 테스트` 외부 그룹에 연결해 Beta App Review로 넘깁니다.
`release:ios:review-candidate`는 심사 후보를 업로드하지만 App Store 심사를 대신
제출하지는 않습니다.

App Store Connect API 키는 로컬 `AuthKey_*.p8` 파일 또는
`ASC_API_KEY_PATH`로만 참조합니다. 전체 출시 일정과 현재 빌드 상태는
`docs/mobile-store-registration.md`를 기준으로 관리합니다.
