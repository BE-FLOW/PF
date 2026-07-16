# PetFlow Mobile

PetFlow Android/iOS 앱 작업 공간입니다. 웹 MVP의 핵심 흐름을 모바일에 맞춰 유지하되, 테스터 배포는 Expo EAS와 각 스토어 테스트 채널을 기준으로 합니다.

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
- 참여코드 기반 GPT 검토용 초안과 테스터 피드백
- 계정 삭제 요청 접수

## 테스트 배포 기준

1. Expo 계정 로그인 또는 `EXPO_TOKEN` 연결
2. Android: Google Play 비공개 테스트 트랙에 production AAB 제출
3. iOS: App Store Connect 업로드 후 외부 TestFlight 그룹에 배포
4. App Store: 심사용 메타데이터와 스크린샷을 적용하고 제출 초안 생성

## 배포 명령

```bash
cd apps/mobile
npm run doctor
npm run expo:check
npm run typecheck
npm run eas:whoami
npm run release:android:closed
npm run release:ios:external
npm run prepare:ios:app-store
npm run upload:ios:screenshots
```

`release:ios:external`은 production iOS 빌드를 만들고 App Store Connect로 업로드한 뒤, `PetFlow 보호자 테스트` 외부 TestFlight 그룹에 최신 빌드를 연결하고 Beta App Review로 넘깁니다. App Store Connect API 키는 앱에 넣지 않고 로컬 `AuthKey_*.p8` 파일이나 `ASC_API_KEY_PATH` 환경 변수로만 참조합니다.

`prepare:ios:app-store`는 App Store 1.0 버전에 최신 유효 빌드를 연결하고 한국어 설명, 키워드, 지원 URL, 개인정보 처리방침 URL을 갱신합니다. `upload:ios:screenshots`는 `apps/mobile/store/app-store/iphone-6-7`의 PNG 스크린샷을 App Store Connect 6.7/6.9형 iPhone 스크린샷 세트로 다시 업로드합니다.
