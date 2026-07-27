# 모바일 출시 운영 기준

이 문서는 웹, Android, iOS를 같은 제품 상태로 유지하면서 서로 다른 심사 일정을
안전하게 다루는 단일 출시 기준이다. 수정 중에는 웹만 계속 배포하고, 모바일은 코드
동결 시점의 `main`으로 새 빌드를 만든다.

## 현재 앱 식별자

| 항목 | 값 |
| --- | --- |
| 앱 이름 | 펫플로우 |
| Expo slug | `petflow-mobile` |
| iOS bundle ID | `com.beflow.petflow` |
| Android package name | `com.beflow.petflow` |
| 앱 버전 | `1.0` (`package.json`은 `1.0.0`) |
| iOS App Store version | `1.0` |
| iOS remote build number | `22` (다음 후보는 자동 증가) |
| Android remote version code | `29` (다음 후보는 자동 증가) |
| 개인정보 처리방침 | `https://pf-two-eta.vercel.app/privacy` |

## 2026-07-23 상태

- 웹 운영본은 `main`의 최신 커밋으로 계속 갱신한다.
- Android EAS 원격 version code는 `29`다. 결제가 포함된 다음 후보는 현재
  변경분을 동결한 뒤 자동 증가시켜 만든다.
- iOS App Store Connect에 연결된 빌드는 `1.0 (22)`다. 빌드는 유효하지만 현재
  심사 상태는 `REJECTED`, 출시 방식은 수동이다.
- 따라서 앞으로 수정되는 내용은 새 Android/iOS 빌드를 만들기 전까지 설치된 앱에
  자동 반영되지 않는다.
- Android 정식 출시는 Google Play 프로덕션 액세스와 결제 상품 활성화를 확인한
  뒤 진행한다.
- iOS는 거절 사유를 해소한 최신 결제 빌드를 연결해 다시 심사한다.

## 빌드와 제출 프로필

`apps/mobile/eas.json`의 빌드 프로필은 다음과 같다.

- `development`: 개발 클라이언트와 팀 내부 확인용
- `preview`: 설치 가능한 내부 테스트 APK
- `production`: 스토어 제출용 AAB/IPA

제출 프로필은 용도를 분리한다.

- `closed`: Google Play `alpha` 비공개 테스트 트랙
- `production`: Google Play 정식 트랙 또는 App Store Connect

현재 모바일 빌드는 로그인, 필수 계정 정보 저장, 반려동물 등록·수정·선택, 짧은 건강
기록 입력, 기본 안전 분류, 최근 기록과 건강 흐름, 사진·동영상 첨부, 기록 수정·삭제,
자동 사건 연결, 병원 공유 기본 요약, 보호자가 옮긴 병원 안내, AI 병원 전달 초안,
AI 요약 피드백, 즉시 계정 탈퇴까지 구현되어 있다. 별도 경과 입력이나 흐름 마무리를
요구하지 않는다. Apple 심사와 Google 공개 트랙 제출 전에는 설치 빌드를 다시 확인한다.

## 계속 수정하는 동안

기능을 수정할 때마다 다음 순서를 지킨다.

1. 웹과 모바일의 공통 흐름 및 문구를 함께 확인한다.
2. 웹·모바일 전체 검증을 통과시킨다.
3. `main`에 커밋하고 GitHub CI를 확인한다.
4. 웹을 배포하고 `/api/health`에서 DB 연결과 배포 커밋을 확인한다.
5. 모바일 스토어 빌드는 만들지 않는다.

```bash
npm run verify:all
```

## Android 출시일

출시할 기능을 동결한 뒤 Google Play 프로덕션 액세스가 승인됐는지 확인한다.

```bash
cd apps/mobile
npm run release:android:production
```

아직 비공개 테스터에게만 새 후보를 배포할 때는 다음 명령을 사용한다.

```bash
npm run release:android:closed
```

두 명령 모두 검증과 배포 커밋 확인 후 새 AAB를 만들며, 서로 다른 Play 트랙으로
제출한다. 프로덕션 액세스 심사나 앱 심사가 남아 있으면 제출 즉시 공개되지는 않는다.

## iOS 심사와 출시

현재 연결된 빌드 `22`는 심사에서 거절됐다. 결제 환경과 스토어 상품, 서버 원장
마이그레이션을 모두 활성화한 최신 소스를 코드 동결한 뒤 새 후보로 교체한다.

1. 아래 명령으로 새 후보를 빌드하고 업로드한다.
2. 인앱결제 상품을 앱 버전에 연결한다.
3. 결제 복구와 첫 무료 AI 요약을 Sandbox에서 확인한다.
4. 메타데이터와 스크린샷을 확인한 뒤 새 빌드로 심사를 다시 제출한다.

```bash
cd apps/mobile
npm run release:ios:review-candidate
npm run prepare:ios:app-store
npm run upload:ios:screenshots
```

외부 TestFlight에만 최신 후보를 제공할 때는 다음 명령을 사용한다.

```bash
npm run release:ios:testflight
```

읽기 전용 상태 확인:

```bash
npm run status:ios
```

## 자동 사전검증

릴리스 명령은 다음 조건을 먼저 검사한다.

- Expo 버전과 패키지 버전 일치
- Android package와 iOS bundle ID 일치
- 앱 아이콘, 스토어 이미지, 제출 키 존재
- EAS 로그인
- 변경 사항이 없는 `main`
- 로컬 `main`과 `origin/main` 일치
- 운영 웹과 DB 정상 상태
- 운영 웹 배포 커밋과 모바일 빌드 커밋 일치

이 조건을 우회한 수동 스토어 제출은 하지 않는다.

## 비밀정보와 계정

1. Expo 계정 또는 자동화 환경의 `EXPO_TOKEN`을 준비한다.
2. Apple Developer Program과 Google Play Console 앱 상태를 확인한다.
3. App Store Connect의 앱 ID와 Google Play 앱을 같은 식별자로 연결한다.
4. Google Play 빌드 quota와 내부 테스트 트랙 상태를 확인한다.
5. EAS 제출용 Apple App Store Connect API 키와 Google service account key는
   저장소에 커밋하지 않는다.

- 자동화 환경에서는 `EXPO_TOKEN`을 secret으로만 등록한다.
- `EXPO_PUBLIC_*` 값만 앱에 넣고 OpenAI 키와 service role key는 서버에 둔다.
- Apple API 키와 Google service account key는 저장소에 커밋하지 않는다.

## 스토어 개인정보 응답 초안

현재 모바일 빌드에서 수집하는 데이터:

- 이메일: 로그인과 계정 식별
- 사용자 ID: Supabase Auth 사용자 식별자
- 닉네임: 사용자 계정 표시와 운영
- 휴대전화번호: 서비스 안내, 요청·장애 대응
- 동의 시각과 버전: 개인정보 수집 동의 증빙
- 반려동물 프로필: 품종, 생일, 성별, 체중
- 건강 기록: 보호자가 입력한 관찰과 증상
- 사진과 동영상: 사용자가 첨부한 반려동물 관련 미디어
- AI 리포트 사용량과 피드백: 로그인 사용자 사용량, 만족도, 지불의향
- 구매 내역: 스토어가 발급한 거래 식별자, 상품, 구매·환불 상태와 금액
- 제품 상호작용: 구매 화면 진입, 결제 시작·취소·실패, AI 요약 공유 여부

결제수단과 카드번호는 Apple·Google이 관리하며 PetFlow 서버에는 저장하지 않는다.
구매 내역과 제품 상호작용은 서버 이용권 확인과 첫 유료 흐름 개선 목적으로 사용자
ID에 연결한다. 관찰 원문·사진·영상·이메일·전화번호는 결제 지표에 복사하지 않는다.

공유하지 않는 것:

- 광고 목적 데이터 공유 없음
- 외부 분석 SDK 없음
- 위치, 주소, 실명 확인 정보, 반려동물 등록번호 없음
- 사용자 데이터의 모델 학습 사용 없음

## Apple App Store Connect 등록 정보

- 앱 ID: `6786073387`
- Bundle ID: `com.beflow.petflow`
- App Store version: `1.0`
- 현재 연결 빌드: iOS build `22`
- 카테고리: 라이프스타일
- 연령 등급: 9+
- 가격: 무료
- 개인정보 답변: 이름, 이메일 주소, 전화번호, 사용자 ID, 사진 또는 비디오,
  기타 사용자 콘텐츠, 구매 내역, 제품 상호작용 수집. 추적 목적 사용 없음.
- 콘텐츠 권한: 타사 콘텐츠를 포함, 표시 또는 이용하지 않음.
- 심사 정보: `kisuwo16+appreview@gmail.com` 심사용 계정 준비.
- 현재 App Store Connect 상태는 `npm run status:ios`로 조회한다.

등록 전 확인:

- 최소 제출 기능: 계정, 반려동물 등록, 오늘 건강 기록, 병원 공유 요약
- 앱이 단순 WebView 포장이 아니라 네이티브 입력, 세션 유지, 파일 첨부, 기기 공유,
  알림 같은 앱 기능을 갖추도록 유지한다.
- App Privacy Details에서 이메일, 전화번호, 사용자 ID, 건강 관련 사용자 입력,
  사진·동영상, 구매 내역, 제품 상호작용 사용 여부를 실제 빌드 기준으로 신고한다.
- AI 리포트는 수의사 확인 정보가 아닌 초안이라고 심사 메모와 앱 UI에 표시한다.
- 즉시 계정 탈퇴 경로는 앱 계정 화면과 개인정보 처리방침에 제공한다.

App Store 메타데이터와 스크린샷은 다음 스크립트로 반복 적용한다.

```bash
cd apps/mobile
npm run prepare:ios:app-store
npm run upload:ios:screenshots
```

App Store Connect API 키는 저장소에 커밋하지 않는다. 기본 탐색 경로는
`~/Downloads/AuthKey_*.p8` 또는 `~/AppData/Local/PetFlow/apple/AuthKey_*.p8`이며,
필요하면 `ASC_API_KEY_PATH`로 지정한다.

## Google Play Console 등록 정보

등록 전 확인:

- 새 앱은 Android 15, API level 35 이상을 target해야 한다.
- Data safety 응답은 현재 배포 중인 모든 버전의 데이터 수집 합계를 기준으로
  작성한다.
- 인앱결제 출시 빌드에는 구매 내역과 앱 상호작용을 계정 관리·기능 제공·분석
  목적으로 신고하고, 광고·추적 목적은 선택하지 않는다.
- 내부 테스트 트랙부터 시작하고, 사용자 피드백으로 UX와 개인정보 문구를 조정한다.

## 다음 유료 검증

- 첫 AI 병원 전달 요약 1회는 무료로 제공한다.
- 이후 `AI 병원 전달 요약 1회 이용권`을 Apple·Google 인앱결제로 판매한다.
- 구독은 단건 재구매 신호가 확인된 뒤 검토한다.
- 스토어 영수증 검증, 계정별 구매 내역 동기화, 서버 이용권 원장, 환불 반영이 모두
  완료되기 전에는 스토어 설명에 유료 기능을 표시하지 않는다.

## 아직 하지 않는 것

- 병원 대시보드
- 위치 권한
- 광고, 외부 분석 SDK, 앱 추적 권한
- 진단, 처방, 약명, 용량, 치료 계획 생성

## 출시 직전 확인

- Google/Apple 신규 로그인과 기존 계정 연결
- 로그아웃 후 재로그인 시 반려동물과 기록 유지
- 계정 탈퇴 후 데이터 접근 차단
- 사진·동영상 첨부와 최근 기록 열람
- 기록 수정·삭제와 병원 공유 요약
- AI 초안이 수의사 확인 정보로 표시되지 않는지 확인
- 앱 설정 하단 버전·빌드 번호 확인

## 공식 문서

- Apple App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play target API requirements: https://support.google.com/googleplay/android-developer/answer/11926878
- Expo EAS Build: https://docs.expo.dev/build/introduction/
- Expo EAS Submit: https://docs.expo.dev/submit/introduction/
