# PetFlow Mobile

Android와 iOS가 공유하는 Expo React Native 앱입니다. 핵심 흐름은 병원 가기 전
한 줄·사진 기록, 사실 확인, 병원 전달본 공유이며 웹 사용을 전제로 하지 않습니다.

## 실행

```bash
cd apps/mobile
npm install
npm run start
```

`.env.example`을 기준으로 공개 가능한 Supabase URL·publishable key와 서버 API URL만
설정합니다. OpenAI 키, Supabase service role, 스토어 제출 키와 RevenueCat 키는
무료 공개 앱에 넣지 않습니다.

## 보안 계약

- Google/Apple OAuth와 기존 이메일 로그인을 Supabase PKCE로 처리합니다.
- 세션은 iOS Keychain·Android Keystore 기반 SecureStore에 보관합니다.
- AsyncStorage에는 튜토리얼 확인 같은 비민감 상태만 둡니다.
- 원문 기록, AI 공정사용 한도, 파일 경로는 서버의 응답을 기준으로 합니다.
- 무료 공개 앱은 인앱결제 SDK를 초기화하거나 상품을 조회하지 않습니다.
- 상품·가격·구매·복원·남은 이용권과 결제 유도 화면을 노출하지 않습니다.
- 로그인 계정은 결제 없이 AI 병원 전달본을 만들 수 있습니다. 서버 공정사용 한도가
  있다면 남은 범위와 초기화 시점을 명확한 한국어로 안내하고 클라이언트 플래그나
  참여코드로 우회하지 않습니다.
- 기록 저장은 요청별 idempotency key를 사용해 네트워크 재시도 중복을 막습니다.
- 사진·영상은 서버가 발급한 비공개 Storage 업로드 경로만 사용합니다.

## 검증

```bash
npm run verify
npm run build:android:production
npm run stamp:android:screenshots -- --build-number <새빌드> --confirm-qa ANDROID_BUILD_<새빌드>_QA_PASSED --execute true
npm run release:preflight:android
npm run release:ios:review-candidate
npm run stamp:ios:screenshots -- --build-number <새빌드> --confirm-qa IOS_BUILD_<새빌드>_QA_PASSED --execute true
npm run release:preflight:ios
```

무료 공개 후보에서는 스토어 상품 상태가 아니라 설치본에 결제 화면·상품 조회·복원
동작이 없고, AI 전달본을 결제 없이 만들 수 있는지 확인합니다. 과거 결제 스크립트와
원장 설명은 향후 재검토용 [`docs/billing.md`](../../docs/billing.md)에만 남아 있으며
무료 출시 절차에는 사용하지 않습니다. release preflight는 실제 파일 존재만 보지 않고
정확한 최신 EAS store build와 screenshot manifest의 빌드·커밋·캡처 QA·해시를 함께
검증합니다.

Google Play 화면은 production AAB를 먼저 만든 다음, 같은 커밋과 원격 versionCode의
`store-screenshot` APK를 설치한 전용 QA 에뮬레이터에서 캡처합니다. 로컬 AVD 이름은
`PetFlow_Phone_API36`, `PetFlow_Tablet7_API36`, `PetFlow_Tablet10_API36`입니다.
개인 기록이 없는 QA 계정으로 화면을 준비한 뒤 아래처럼 한 장씩 저장하고, 모든 화면을
눈으로 확인한 다음 기존 stamp 절차를 실행합니다.

```bash
npm run build:android:store-screenshot
npm run capture:android:screenshot -- --set phone --file 01-home-score.png --build-number <새빌드>
npm run capture:android:screenshot -- --set phone --file 01-home-score.png --build-number <새빌드> --execute true --overwrite true --confirm-no-personal-data true
npm run generate:android:feature-graphic -- --execute true
```

7인치는 `--set tablet-7`, 10인치는 `--set tablet-10`을 사용합니다. 캡처 스크립트는
정확한 AVD, 설치된 앱 버전·versionCode, 전경 앱, 권장 9:16 해상도와 알파 채널 부재를
확인합니다. iOS 스크린샷은 Windows 에뮬레이터로 만들지 않고 새 TestFlight 빌드를
실제 iPhone에서 확인한 뒤 캡처합니다.

## 배포 명령

```bash
npm run build:android:production
npm run stamp:android:screenshots -- --build-number <새빌드> --confirm-qa ANDROID_BUILD_<새빌드>_QA_PASSED --execute true
npm run release:android:closed
npm run release:android:production
npm run release:ios:review-candidate
npm run stamp:ios:screenshots -- --build-number <새빌드> --confirm-qa IOS_BUILD_<새빌드>_QA_PASSED --execute true
npm run readiness:ios:app-store -- --build-number <새빌드>
```

배포는 DB 마이그레이션과 서버 API가 먼저 반영된 뒤 진행합니다. 스토어 상태와
현재 빌드는 `docs/mobile-store-registration.md`를 기준으로 확인합니다. iOS
TestFlight 배포, 양 플랫폼 스크린샷 교체, 기존 승인 철회는 모두 정확한 빌드 번호를
요구합니다. stamp 뒤에는 이미지와 manifest만 커밋·push하고 최종 preflight를 실행합니다.
