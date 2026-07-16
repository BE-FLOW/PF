# 모바일 앱 등록 준비

이 문서는 Android와 iOS 등록을 위해 필요한 설정, 스토어 응답, 남은 작업을
간결하게 고정한다. 현재 운영 기준은 Google Play 비공개 테스트, iOS 외부
TestFlight, 그리고 Apple App Store 1.0 심사 제출 준비 상태다.

## 현재 앱 식별자

| 항목 | 값 |
| --- | --- |
| 앱 이름 | 펫플로우 |
| Expo slug | `petflow-mobile` |
| iOS bundle ID | `com.beflow.petflow` |
| Android package name | `com.beflow.petflow` |
| 앱 버전 | `0.1.0` |
| iOS App Store version | `1.0` |
| iOS build number | `17` |
| Android version code | EAS remote auto increment |
| 개인정보 처리방침 | `https://pf-two-eta.vercel.app/privacy` |

## 빌드와 제출

`apps/mobile/eas.json`에 세 프로필을 둔다.

- `development`: 개발 클라이언트와 팀 내부 확인용
- `preview`: 설치 가능한 내부 테스트 APK
- `production`: TestFlight, Google Play 비공개 테스트, App Store 제출용

현재 모바일 빌드는 로그인, 테스터 정보 저장, 반려동물 등록·수정·선택, 오늘 건강
기록 입력, 기본 안전 분류, 최근 기록 확인, 최근 14일 건강 흐름, 사진·동영상
첨부, 기록 수정·삭제, 사건별 병원 공유 요약, 병원에서 받은 안내 체크리스트, 3일·7일·14일
경과 기록, 장기 30일·60일·90일 경과 기록, 참여코드 기반 GPT 검토용 초안 생성,
GPT 유용성·지불의향 피드백, 계정 삭제 요청 접수까지 구현되어 있다. Apple 심사와
Google 공개 트랙 제출 전에는 내부 테스트 빌드를 한 번 더 확인한다.

빌드 전 확인:

1. Expo 계정 또는 자동화 환경의 `EXPO_TOKEN`을 준비한다.
2. Apple Developer Program과 Google Play Console 앱 상태를 확인한다.
3. App Store Connect의 앱 ID와 Google Play 앱을 같은 식별자로 연결한다.
4. Google Play 빌드 quota와 내부 테스트 트랙 상태를 확인한다.
5. EAS 제출용 Apple App Store Connect API 키와 Google service account key는
   저장소에 커밋하지 않는다.

권장 명령:

```bash
cd apps/mobile
npm run doctor
npm run expo:check
npm run typecheck
npm run eas:init
npm run build:android:preview
npm run build:android:production
npm run build:ios:production
npm run submit:ios
npm run submit:android
npm run prepare:ios:app-store
npm run upload:ios:screenshots
```

## 2026-06-29 빌드 준비 상태

완료:

- `expo-doctor`: 21/21 통과
- `expo install --check`: 권장 버전 일치
- `npm run typecheck`: 통과
- EAS project ID 연결
- Google Play Console 앱 생성과 최초 업로드 진행

남은 연결과 제약:

- Expo Free plan Android build quota가 소진되면 다음 reset까지 production AAB 재빌드가 막힌다.
- 자동화 환경에서는 `EXPO_TOKEN`을 secret으로 등록하고 앱 번들에는 넣지 않는다.
- `EXPO_PUBLIC_*` 값만 모바일 빌드에 넣고, OpenAI 키와 service role key는 서버에만 둔다.

## 스토어 개인정보 응답 초안

현재 모바일 빌드에서 수집하는 데이터:

- 이메일: 로그인과 계정 식별
- 사용자 ID: Supabase Auth 사용자 식별자
- 닉네임: 테스터 계정 표시와 운영
- 휴대전화번호: 테스트 안내, 요청·장애 대응
- 동의 시각과 버전: 개인정보 수집 동의 증빙
- 반려동물 프로필: 품종, 생일, 성별, 체중
- 건강 기록: 보호자가 입력한 관찰과 증상
- 사진과 동영상: 사용자가 첨부한 반려동물 관련 미디어
- AI 리포트 사용량과 피드백: 참여코드 테스터 사용량, 만족도, 지불의향

공유하지 않는 것:

- 광고 목적 데이터 공유 없음
- 외부 분석 SDK 없음
- 위치, 주소, 실명 확인 정보, 반려동물 등록번호 없음
- 사용자 데이터의 모델 학습 사용 없음

## Apple App Store Connect

2026-07-16 기준 상태:

- 앱 ID: `6786073387`
- Bundle ID: `com.beflow.petflow`
- App Store version: `1.0`
- 연결 빌드: iOS build `17`
- 카테고리: 라이프스타일
- 연령 등급: 9+
- 가격: 무료
- 개인정보 답변: 이름, 이메일 주소, 전화번호, 사용자 ID, 사진 또는 비디오,
  기타 사용자 콘텐츠 수집. 추적 목적 사용 없음.
- 콘텐츠 권한: 타사 콘텐츠를 포함, 표시 또는 이용하지 않음.
- 심사 정보: `kisuwo16+appreview@gmail.com` 심사용 계정 준비.
- 현재 App Store Connect 상태: `iOS 1.0 심사 준비됨`, 제출 초안 1개 생성.

등록 전 확인:

- 최소 제출 기능: 계정, 반려동물 등록, 오늘 건강 기록, 병원 공유 요약
- 앱이 단순 WebView 포장이 아니라 네이티브 입력, 세션 유지, 파일 첨부, 기기 공유,
  알림 같은 앱 기능을 갖추도록 유지한다.
- App Privacy Details에서 이메일, 전화번호, 사용자 ID, 건강 관련 사용자 입력,
  사진·동영상 사용 여부를 실제 빌드 기준으로 신고한다.
- AI 리포트는 수의사 확인 정보가 아닌 초안이라고 심사 메모와 앱 UI에 표시한다.
- 계정 삭제 요청 경로는 앱 계정 화면과 개인정보 처리방침에 제공한다.

App Store 메타데이터와 스크린샷은 다음 스크립트로 반복 적용한다.

```bash
cd apps/mobile
npm run prepare:ios:app-store
npm run upload:ios:screenshots
```

App Store Connect API 키는 저장소에 커밋하지 않는다. 기본 탐색 경로는
`~/Downloads/AuthKey_*.p8` 또는 `~/AppData/Local/PetFlow/apple/AuthKey_*.p8`이며,
필요하면 `ASC_API_KEY_PATH`로 지정한다.

## Google Play Console

등록 전 확인:

- 새 앱은 Android 15, API level 35 이상을 target해야 한다.
- Data safety 응답은 현재 배포 중인 모든 버전의 데이터 수집 합계를 기준으로
  작성한다.
- 내부 테스트 트랙부터 시작하고, 테스터 피드백으로 UX와 개인정보 문구를 조정한다.

## 아직 하지 않는 것

- 결제와 구독 설정
- 병원 대시보드
- 위치 권한
- 광고, 외부 분석 SDK, 앱 추적 권한
- 진단, 처방, 약명, 용량, 치료 계획 생성

## 다음 작업

1. Apple App Store 심사 제출 여부를 최종 확인하고 `제출 초안(1개)`를 제출한다.
2. Google Play 비공개 테스트 새 버전 업로드와 테스터 링크를 확인한다.
3. iOS 외부 TestFlight 최신 빌드와 App Store 제출 빌드가 같은 기능 상태인지 확인한다.
4. 12명/14일 테스트 운영 로그와 계정 로그인 피드백을 정리한다.

## 공식 문서

- Apple App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play target API requirements: https://support.google.com/googleplay/android-developer/answer/11926878
- Expo EAS Build: https://docs.expo.dev/build/introduction/
- Expo EAS Submit: https://docs.expo.dev/submit/introduction/
