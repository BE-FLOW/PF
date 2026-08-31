# 무료 모바일 출시 운영 기준

이 문서는 Android와 iOS 완전 무료 공개판의 빌드·심사·출시 기준이다. 웹은 같은
Supabase 프로젝트와 서버 API를 쓰는 보조 화면이며, 모바일은 코드 동결 시점의 같은
`main` 커밋으로 빌드한다.

## 현재 제품 계약

- 기록 조회·수정·삭제·기본 공유와 AI 병원 전달본을 무료로 제공한다.
- 앱과 스토어 등록정보에 상품, 가격, 구매, 복원, 남은 이용권이나 결제 유도를
  노출하지 않는다.
- Android·iOS 빌드는 RevenueCat을 초기화하거나 상품 조회, 구매, 복원, 결제
  동기화를 실행하지 않는다.
- App Store Connect와 Google Play의 과거 인앱상품은 이번 앱 버전 또는 심사 제출에
  연결하지 않는다.
- 스토어 문구의 `무료`, `자동 결제 없음`은 설치본 동작과 일치해야 한다.

## 앱 식별자

| 항목 | 값 |
| --- | --- |
| 앱 이름 | 펫플로우 |
| Expo slug | `petflow-mobile` |
| iOS bundle ID | `com.beflow.petflow` |
| Android package name | `com.beflow.petflow` |
| 앱 버전 | `1.0` (`package.json`은 `1.0.0`) |
| 개인정보 처리방침 | `https://pf-two-eta.vercel.app/privacy` |
| 계정 및 데이터 삭제 | `https://pf-two-eta.vercel.app/account-deletion` |
| 지원 URL | `https://pf-two-eta.vercel.app` |

빌드 번호와 스토어 상태는 문서에 고정하지 않는다. 제출 직전에 iOS는 아래 상태
명령으로, Android는 EAS와 Google Play Console에서 확인한 값을 출시 기록에 남긴다.

```powershell
npm --prefix apps/mobile run status:ios
```

## 2026-08-31 출시 재개 기록

새 기능과 화면 개선은 동결하고 무료 공개의 검증·업로드·심사 차단사항만 처리한다.
아래 값은 당시 실행 증거이며 다음 작업에서는 콘솔 상태를 다시 조회한다.

- iOS production build `32` (`174779e0-899c-4f04-b31a-b886c6deba61`)을
  재빌드 없이 App Store Connect에 업로드했다. EAS submission은
  `d3ce2bf6-3e1a-45c6-8125-775db29b2e7d`이며 ASC build
  `c55ef09a-60fa-479c-ace6-3a4d98cd5936`의 `VALID` 처리와
  `PetFlow 내부 테스트` 그룹 연결을 확인했다. 공개 심사 제출이나 실기기 QA
  완료를 뜻하지 않는다.
- Android production build `34` (`f68cb93e-aaca-44c4-ae5c-71237a8a0321`)는
  당시 preflight 13개를 통과했지만 Play에 아직 업로드되지 않았다.
- Google Play의 과거 `petflow_ai_summary_1 / standard` 구매옵션을
  `ACTIVE`에서 `INACTIVE`로 변경하고 API 재조회로 확인했다. 상품 삭제, 환불,
  과거 거래와 법적 정보 변경은 하지 않았다. 직후에도 대한민국 개발자 추가 정보
  경고가 남아 검토 제출은 차단됐다. 반영 지연인지 별도 계정 조건인지는 미확인이다.
- Google Play 프로덕션 접근은 승인 전이다. 재신청 마지막 질문인 최근 추가
  비공개 테스트에서 달라진 점에는 실제 참여·검증·피드백 사실이 필요하다.
  자동 테스트 결과를 실제 사용자 테스트 진술로 대체하지 않는다.
- 첫 전체 검사에서 웹 lint·테스트·build, 모바일 typecheck·60개 테스트·21개
  release 테스트, DB 190개 테스트와 운영 무료 모드 검증은 통과했다.
  온라인 Expo 검사는 SDK 패치 7개의 차이로 실패해 전체 통과로 기록하지 않았다.
  설치된 SDK 고정 매핑은 일치했으나 공개 후보는 권장 패치로 맞췄다. Expo
  `57.0.18`, React Native `0.86.3`와 권장 모듈 패치를 적용하고 중복 네이티브
  모듈을 정리한 뒤 온라인 `npm run verify:all` 전체가 통과했다. Expo Doctor도
  `21/21` 통과했다. 앱 기능·화면·데이터 모델은 변경하지 않았다.
- 기존 iOS 스크린샷은 build `22`이므로 무료 공개용으로 제출하지 않는다.
  캡처 브랜치 `codex/ios-capture-build32`의 `4678eae`는 인증 설정을 검증된
  앱 번들과 대조하고 QA 로그인 사전검증을 추가했다. 해당 실행은 GitHub Actions
  `33343738614`이며 결과 확인 전 캡처 성공으로 간주하지 않는다.

## 구현된 공개 범위

현재 모바일 앱은 로그인, 반려동물 등록·수정·삭제·선택, 한 줄 건강 기록,
결정론적 안전 분류, 사진·동영상 첨부, 기록 조회·수정·삭제, 자동 사건 연결,
기본 사실 요약·공유, 보호자가 옮긴 병원 안내, AI 병원 전달본, 피드백과 즉시 계정
탈퇴를 제공한다. 별도 경과 입력이나 흐름 마무리를 요구하지 않는다.

코드에 기능이 있다는 사실만으로 출시 준비 완료로 판정하지 않는다. 제출 후보를
실제 Android와 iPhone에 설치해 이 문서의 흐름을 다시 검증한다.

## 출시 전 자동 검증

저장소 루트에서 다음 명령을 모두 통과시킨다.

```powershell
npm run verify:all
npm run verify:deployment -- https://pf-two-eta.vercel.app
```

DB 변경이 있으면 Docker가 실행되는 환경에서 pgTAP을 추가로 실행하고, 원격
migration·lint 상태를 확인한다. Expo·스토어 사전 점검이 유료 상품이나 RevenueCat
키를 요구한다면 무료 계약과 충돌하는 오래된 검사이므로 우회해 제출하지 말고 해당
검사 또는 빌드 설정을 먼저 고친다.

## 제출 후보 공통 조건

- `main`, `origin/main`, 운영 웹 배포와 모바일 빌드의 커밋이 일치한다.
- 작업 트리가 깨끗하고 CI와 `verify:all`이 통과한다.
- 운영 `/api/health`의 DB 연결·`freeReleaseSchema: ready`·`free` 출시 모드·배포
  커밋이 정상이고, 레거시 결제 API는 `410 Gone`으로 비활성이다.
- 무료 빌드 환경에는 `EXPO_PUBLIC_REVENUECAT_*` 변수를 만들지 않는다.
- 네이티브 앱 설정에 불필요한 인앱결제 권한·플러그인·기능 선언이 없다.
- 로그인 계정으로 AI 병원 전달본을 결제 없이 생성·공유할 수 있다.
- 앱 아이콘, 스크린샷, 개인정보·심사 문구가 제출 빌드와 일치한다.
- 계정 탈퇴가 비공개 파일과 계정 데이터를 실제로 삭제한다.

이 조건을 우회한 수동 제출은 하지 않는다.

## Android 출시

Google Play 프로덕션 액세스와 대상 API 조건을 확인한 뒤 코드 동결 커밋으로 후보를
먼저 빌드한다. `release:android:*`는 새 빌드를 만들지 않고, 아래에서 stamp와
preflight를 통과한 최신 production AAB만 제출한다.

```powershell
npm --prefix apps/mobile run verify
npm --prefix apps/mobile run build:android:production
npm --prefix apps/mobile run stamp:android:screenshots -- --build-number <새빌드> --confirm-qa ANDROID_BUILD_<새빌드>_QA_PASSED --execute true
npm --prefix apps/mobile run release:preflight:android
npm --prefix apps/mobile run release:android:closed
npm --prefix apps/mobile run release:android:production
```

후보 설치본으로 휴대전화·7인치·10인치 화면을 각각 다시 캡처하고 기기 QA를 마친 뒤
stamp를 실행한다. 생성된 세 manifest와 이미지만 커밋·push한 상태에서 preflight를
실행한다. preflight는 manifest의 빌드와 최신 EAS production store build, 빌드 커밋,
캡처·QA 시각, 크기와 SHA-256을 다시 대조한다. 먼저 비공개 트랙에서 핵심 흐름을
확인하고 같은 검증을 통과한 AAB만 공개 트랙으로 승격한다. 무료 공개 버전에는 과거
관리형 상품을 연결하지 않고, 스토어 등록정보에도 인앱구매 제공 문구를 표시하지 않는다.

## iOS 출시

코드 동결 커밋으로 새 후보를 만들고, 제출 전 정확한 TestFlight 설치본의 실기기 검증을
별도로 마친다.

```powershell
npm --prefix apps/mobile run release:ios:review-candidate
npm --prefix apps/mobile run stamp:ios:screenshots -- --build-number <새빌드> --confirm-qa IOS_SCREENSHOTS_BUILD_<새빌드>_QA_PASSED --execute true
npm --prefix apps/mobile run release:preflight:ios
npm --prefix apps/mobile run readiness:ios:app-store -- --build-number <새빌드> --confirm-device-qa IOS_BUILD_<새빌드>_DEVICE_QA_PASSED
```

`release:ios:review-candidate`는 후보 바이너리를 만들고 App Store Connect에 업로드한다.
기본 캡처 경로는 정확한 TestFlight 설치본이다. CI 시뮬레이터를 예외적으로 사용할 때는
production 빌드와 동일한 runtime commit의 Simulator artifact만 허용하며 artifact 해시,
EAS 빌드 번호·ID, 캡처 커밋을 manifest의 `source`에 기록한다. 스크린샷 시각 검수는
`IOS_SCREENSHOTS_BUILD_<새빌드>_QA_PASSED`로 stamp하지만 TestFlight 실기기 QA를
대체하지 않는다. 실기기 확인 후 별도의 `IOS_BUILD_<새빌드>_DEVICE_QA_PASSED`를
readiness에 전달한다.

App Store Connect에서는 현재 무료 후보 빌드만 버전 `1.0`에 연결한다. 과거 빌드나
첫 인앱결제 상품을 이번 버전에 포함하지 않는다. 스크린샷과 메타데이터는 정확한
빌드 번호를 지정해 적용한다.

```powershell
npm --prefix apps/mobile run prepare:ios:app-store -- --build-number <새빌드> --execute true
npm --prefix apps/mobile run upload:ios:screenshots -- --build-number <새빌드>
```

App Store Connect API 키와 Google service account key는 저장소에 커밋하지 않는다.

## 스토어 메타데이터와 이미지

한국어 등록 문구의 단일 원본은
[`apps/mobile/store/ko-KR/listing.md`](../apps/mobile/store/ko-KR/listing.md)다.

Google Play:

- 앱 아이콘: `apps/mobile/store/google-play/app-icon-512.png`
- 그래픽 이미지: `apps/mobile/store/google-play/feature-graphic-1024x500.png`
- 그래픽 이미지의 빌드·커밋·QA·SHA-256: `apps/mobile/store/google-play/manifest.json`
- 휴대전화 스크린샷: `apps/mobile/store/google-play/screenshots-phone/*.png`
- 7인치 태블릿: `apps/mobile/store/google-play/screenshots-tablet-7/*.png`
- 10인치 태블릿: `apps/mobile/store/google-play/screenshots-tablet-10/*.png`
- 각 폴더의 빌드·커밋·캡처 QA·SHA-256: `manifest.json`

Apple App Store:

- 앱 아이콘: `apps/mobile/store/app-store/app-icon-1024.png`
- iPhone 6.7/6.9 스크린샷: `apps/mobile/store/app-store/iphone-6-7/*.png`
- 같은 폴더의 빌드·커밋·캡처 QA·SHA-256: `manifest.json`

모든 스크린샷은 무료 후보의 실제 화면이어야 한다. 가격, 구매 버튼, 복원, 남은
이용권과 과거 결제 모달이 보이는 이미지는 사용하지 않는다. 과거 IAP 심사용 이미지는
앱 버전 스크린샷으로 제출하지 않는다. PNG는 지정 크기와 SHA-256뿐 아니라 알파 채널이나
투명도 청크가 없는 불투명 이미지여야 한다.

### 2026-08-18 저장소 이미지 감사

아래 항목은 2026-08-18 당시 발견한 교체 사유다. 최신 승인 상태는 각 manifest와
`release:preflight:*` 결과를 기준으로 판단한다. Android 항목은 build `34` 화면 세트와
그래픽 이미지로 교체되어 현재 preflight를 통과한다. iOS 항목은 새 build `32` 화면과
manifest가 커밋될 때까지 미해결로 유지한다.

- `store/app-store/iphone-6-7/manifest.json`은 과거 build `22`, commit
  `67f11be545509efbe80b61770f8c19841863f2b1`을 가리킨다.
- App Store의 `05-report-summary.png`에는 `4회 남음` 문구가 보여 무료 계약과
  충돌한다.
- Google Play 스크린샷도 2026-06-25에 만든 과거 화면이다.
- Google Play 그래픽 이미지는 `Record daily changes`를 광고해 병원 직전 준비 중심의
  현재 제품 계약과 충돌한다.
- Google Play 세 폴더에는 현재 빌드에 묶인 manifest가 없고, 7인치와 10인치 세트는
  바이트까지 동일하다.

따라서 저장소의 기존 스크린샷은 이번 무료 공개판 제출에 사용할 수 없다. 새 무료
후보를 실제 기기에 설치한 뒤 양 플랫폼 화면을 모두 다시 캡처하고, manifest의 빌드·
커밋·캡처 및 QA 시각·크기·파일 해시를 검증한 다음에만 업로드한다. 그래픽 이미지도
같은 Android 후보 빌드의 manifest로 승인해야 한다. Google Play의
서로 다른 기기 등급 세트가 바이트까지 같으면 preflight가 거부한다.

## 개인정보 응답 기준

제출 직전 설치본과 서버 동작을 기준으로 각 콘솔에 답한다. 현재 무료 공개 범위에서
다루는 데이터는 다음과 같다.

- 이메일 또는 OAuth 계정 식별자: 로그인과 계정 관리
- 사용자 ID: 계정 데이터 소유권 확인
- 반려동물 프로필: 보호자가 선택적으로 입력한 정보
- 건강 관련 사용자 콘텐츠: 관찰 기록과 보호자가 옮긴 병원 안내
- 사진·동영상: 사용자가 선택해 첨부한 미디어
- AI 사용량·피드백과 전달본 공유 상호작용: 기능 제공, 공정사용과 제품 개선

무료 빌드는 RevenueCat이나 스토어 구매 API를 실행하지 않으므로 새 구매 내역,
결제 시도·취소·실패 이벤트를 수집하지 않는다. 콘솔의 `구매 내역` 또는 인앱결제 관련
응답은 과거 문서를 복사하지 말고 제출되는 모든 활성 버전의 실제 동작을 기준으로
판정한다.

다음 원칙은 유지한다.

- 광고 목적 데이터 공유, 외부 분석 SDK와 추적 권한 없음
- 위치, 주소, 전화번호, 실명 확인 정보와 반려동물 등록번호를 가입 조건으로 수집하지 않음
- 사용자 기록을 모델 학습에 기본 제공하지 않음
- OpenAI 요청은 서버에서만 수행하고 AI 초안을 수의사 확인 정보로 표시하지 않음
- 앱 안에서 즉시 계정 탈퇴 경로 제공

## 심사 메모 필수 내용

- PetFlow는 보호자의 관찰 사실을 기록·정리·공유하는 도구이며 진단·처방·약명·용량·
  치료 계획을 제공하지 않는다.
- AI 병원 전달본은 로그인 사용자의 선택 기록만 정리한 수의사 검토 전 초안이다.
- 기록과 AI 병원 전달본은 무료이며 상품 구매나 자동 결제가 없다.
- Google·Apple 로그인을 기본으로 하고 기존 이메일 경로를 보조로 제공한다.
- 전화번호, 주소, 위치와 법적 신원을 가입 조건으로 요구하지 않는다.
- 계정 화면에서 기록과 비공개 파일을 포함한 탈퇴를 요청할 수 있다.

## 실기기 출시 점검

1. Google·Apple 신규 로그인, 기존 계정 연결과 중복 identity 거절을 확인한다.
2. 이메일 확인·비밀번호 재설정 딥링크와 로그아웃·재로그인을 확인한다.
3. 반려동물 등록 후 한 줄 또는 사진으로 기록하고 수정·삭제한다.
4. 사진·동영상 첨부, 열람과 개별 삭제를 확인한다.
5. 새 계정으로 병원 준비부터 AI 전달본 생성·기기 공유까지 3분 안에 마친다.
6. AI 초안이 진단이나 수의사 확인 정보처럼 보이지 않는지 표본 검수한다.
7. 공정사용 한도와 초기화 시점이 명확하며 기본 사실 전달본은 계속 제공되는지 확인한다.
8. 앱 전체를 순회해 상품·가격·구매·복원·남은 이용권·참여코드가 없는지 확인한다.
9. 기기와 프록시 로그에서 RevenueCat 초기화·상품 조회·결제 동기화가 없는지 확인한다.
10. 계정 탈퇴 뒤 Auth, DB 행과 Storage 파일 접근이 차단되는지 확인한다.

## 이번 공개판에서 하지 않는 것

- 인앱결제, 외부 결제, 구독, 구매 복원과 결제 동기화
- 병원 대시보드와 EMR 연동
- 위치 권한, 광고, 외부 분석 SDK와 앱 추적 권한
- 진단, 처방, 약명, 용량과 치료 계획 생성

과거 결제 상품·원장·도구는 [`billing.md`](billing.md)에 현재 비활성 아카이브로만
남긴다. 유료 기능은 사업자 등록과 무료판 실사용 근거를 확인한 뒤 별도 제품 결정을
작성하기 전에는 다시 켜지 않는다.

## 공식 문서

- Apple App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play target API requirements: https://support.google.com/googleplay/android-developer/answer/11926878
- Expo EAS Build: https://docs.expo.dev/build/introduction/
- Expo EAS Submit: https://docs.expo.dev/submit/introduction/
