# 모바일 테스트 배포 안내

목표는 공개 출시 전, 인증된 테스터가 스토어 테스트 경로로 최신 앱을 받고 Google/Apple 로그인, 계정 연결, 반려동물 등록, 건강 기록, 미디어 첨부, 병원 공유 요약, GPT 초안까지 실제 기기에서 확인하는 것입니다.

## 사전 확인

```bash
cd apps/mobile
npm install
npm run doctor
npm run expo:check
npm run typecheck
```

모바일 앱에는 공개 가능한 환경 변수만 넣습니다.

```text
EXPO_PUBLIC_API_BASE_URL=https://pf-two-eta.vercel.app
EXPO_PUBLIC_SUPABASE_URL=https://your-test-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

`OPENAI_API_KEY`, Supabase service role key, 스토어 제출 키는 앱 번들에 넣지 않습니다.

## Expo와 EAS 연결

```bash
cd apps/mobile
npx eas-cli login
npm run eas:whoami
```

자동화 환경에서는 `EXPO_TOKEN`을 secret으로 설정하고 앱 번들 안에는 넣지 않습니다.

## Android 비공개 테스트

빠른 설치 확인은 preview APK로 할 수 있지만, 테스터 배포 기준은 Google Play 비공개 테스트 트랙에 올린 production AAB입니다. `eas.json`의 production submit 설정은 Google Play `alpha` 트랙을 사용합니다.

```bash
cd apps/mobile
npm run release:android:closed
```

이 명령은 Android production 빌드를 만들고 최신 AAB를 Google Play 비공개 테스트 트랙에 제출합니다.

## iOS 외부 TestFlight

Apple Developer Program, App Store Connect 앱, 외부 테스트 그룹 `PetFlow 보호자 테스트`, TestFlight 테스트 정보가 준비되어 있어야 합니다.

```bash
cd apps/mobile
npm run release:ios:external
```

이 명령은 iOS production 빌드를 만들고 App Store Connect로 업로드한 뒤, 최신 유효 빌드를 `PetFlow 보호자 테스트` 외부 TestFlight 그룹에 연결하고 Beta App Review로 넘깁니다.

자동 배포 스크립트는 App Store Connect API 키 파일을 Git에 저장하지 않습니다. 기본 경로에서 키를 찾지 못하면 `ASC_API_KEY_PATH`를 `AuthKey_*.p8` 파일 경로로 지정합니다.

## 한 번에 배포

Android 비공개 테스트와 iOS 외부 TestFlight 업로드를 이어서 실행합니다.

```bash
cd apps/mobile
npm run release:all
```

## 계정 플로우 체크리스트

- Google/Apple로 신규 가입
- Google/Apple로 기존 계정 로그인
- 기존 이메일 계정에서 Google/Apple 계정 연결
- 같은 이메일 충돌과 다른 계정 연결 충돌 메시지
- 로그아웃 후 재로그인 시 기록 유지
- 계정 탈퇴 요청 후 계정, 반려동물, 기록, 미디어 접근 차단
- 테스터 필수 정보: 이메일, 닉네임, 국내 휴대전화번호, 개인정보 동의
