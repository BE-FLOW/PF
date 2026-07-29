# PetFlow Mobile

Android와 iOS가 공유하는 Expo React Native 앱입니다. 핵심 흐름은 짧은 관찰 저장,
시간 흐름 확인, 병원 전달 요약이며 웹 사용을 전제로 하지 않습니다.

## 실행

```bash
cd apps/mobile
npm install
npm run start
```

`.env.example`을 기준으로 공개 가능한 Supabase URL·publishable key와 서버 API URL만
설정합니다. OpenAI 키, Supabase service role, 스토어 제출 키는 앱에 넣지 않습니다.

## 보안 계약

- Google/Apple OAuth와 기존 이메일 로그인을 Supabase PKCE로 처리합니다.
- 세션은 iOS Keychain·Android Keystore 기반 SecureStore에 보관합니다.
- AsyncStorage에는 튜토리얼 확인 같은 비민감 상태만 둡니다.
- 원문 기록, AI 사용 권한, 파일 경로는 서버의 응답을 기준으로 합니다.
- 로그인한 Supabase 사용자 UUID만 스토어 구매 계정으로 사용하며 익명 구매를
  허용하지 않습니다.
- iOS·Android 가격은 스토어의 현지화 값을 표시하고 구매 뒤 서버가 검증한
  이용권만 AI 요약에 사용합니다.
- 첫 무료 요약이 남아 있는 동안에는 유료 구매를 먼저 권하지 않습니다. 무료분을
  사용한 뒤에만 자동 갱신 없는 1회 이용권을 보여 줍니다.
- 결제 직후 서버 반영이 늦으면 앱이 짧게 재확인하고, 요청하던 AI 요약을 자동으로
  이어 만듭니다. `결제 반영 확인`은 지연 상황을 위한 보조 경로입니다.
- 기록 저장은 요청별 idempotency key를 사용해 네트워크 재시도 중복을 막습니다.
- 사진·영상은 서버가 발급한 비공개 Storage 업로드 경로만 사용합니다.

## 검증

```bash
npm run verify
npm run release:preflight:android
npm run release:preflight:ios
```

스토어 상품은 아래 읽기 전용 명령으로 확인합니다. 실제 생성 조건과 원장 규칙은
`docs/billing.md`에 있습니다.

```bash
npm run status:android:iap
npm run status:ios:iap
```

## 배포 명령

```bash
npm run release:android:closed
npm run release:android:production
npm run release:ios:review-candidate
npm run readiness:ios:app-store -- --build-number <새빌드>
```

배포는 DB 마이그레이션과 서버 API가 먼저 반영된 뒤 진행합니다. 스토어 상태와
현재 빌드는 `docs/mobile-store-registration.md`를 기준으로 확인합니다. iOS
TestFlight 배포, 스크린샷 교체, 기존 승인 철회는 모두 정확한 빌드 번호를 요구합니다.
