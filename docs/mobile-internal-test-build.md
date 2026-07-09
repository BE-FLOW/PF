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
npm run eas:whoami
```

EAS project ID는 `apps/mobile/app.config.js`에 연결되어 있다. 자동화 환경에서는
`EXPO_TOKEN`을 secret으로 설정하고 앱 번들에는 넣지 않는다.

## Android 내부 테스트

빠른 설치 확인은 preview APK로 시작한다.

```bash
cd apps/mobile
npm run build:android:preview
```

빌드는 EAS preview 환경의 `EXPO_PUBLIC_SUPABASE_URL`과
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 포함한다.

Google Play 내부 테스트 트랙에 올릴 때는 production 빌드를 사용한다.

```bash
npm run build:android:production
npm run submit:android:latest
```

완전 자동 제출에는 Google Play 서비스 계정 JSON이 필요하다. 파일은
`apps/mobile/credentials/google-play-service-account.json`에 두고 커밋하지 않는다.
이 경로는 `eas.json`의 `serviceAccountKeyPath`와 `.gitignore`에 등록되어 있다.

## iOS TestFlight

Apple Developer Program, App Store Connect 앱, 제출용 API 키가 준비된 뒤 실행한다.

```bash
cd apps/mobile
npm run build:ios:production
npm run submit:ios:latest
```

`submit:ios:latest`는 최신 빌드를 내부 TestFlight 그룹에 붙이고, 테스트 안내 문구를
함께 갱신한다. 외부 테스터 그룹 심사 상태는 App Store Connect에서 최종 확인한다.

## 한 번에 배포

플랫폼별 설정이 끝난 뒤에는 다음 명령으로 최신 빌드와 제출을 이어서 실행한다.

```bash
cd apps/mobile
npm run release:all
```

## 내부 테스트 체크리스트

- Google/Apple 로그인과 기존 이메일 계정 보조 로그인
- 기존 이메일 계정에 Google/Apple 계정 연결
- 로그아웃 후 재로그인해 기록 유지 확인
- 계정 탈퇴 시 계정, 반려동물, 건강 기록, 사진·영상, GPT 권한 삭제 확인
- 닉네임, 국내 휴대전화번호, 개인정보 동의 저장
- 반려동물 등록, 수정, 선택
- 오늘 건강 기록, 수정, 삭제와 기본 안전 분류
- 사진과 동영상 첨부
- 같은 사건의 3일, 7일, 14일, 30일, 60일, 90일 경과 기록
- 병원 공유 요약과 기기 공유
- 참여코드 기반 AI 초안 생성
- AI 유용성, 만족도, 지불의향 피드백
