# PetFlow Mobile

PetFlow의 Android/iOS 앱 준비 공간입니다. 현재 웹 테스트 배포를 유지하면서
Expo 기반 모바일 앱을 독립적으로 키우기 위해 루트 Next.js 앱과 분리했습니다.

## 시작 순서

```bash
cd apps/mobile
npm install
npm run start
```

Codex sandbox나 제한된 환경에서 Expo CLI가 사용자 홈에 텔레메트리 파일을 만들지
못하면 다음처럼 텔레메트리를 끄고 실행합니다.

```powershell
$env:EXPO_NO_TELEMETRY='1'
npm run start
```

## 환경변수

`.env.example`을 복사해 `.env`를 만들고 공개 가능한 값만 넣습니다.

```text
EXPO_PUBLIC_API_BASE_URL=https://pf-two-eta.vercel.app
EXPO_PUBLIC_SUPABASE_URL=https://your-test-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

`OPENAI_API_KEY`와 `SUPABASE_SERVICE_ROLE_KEY`는 모바일 앱에 넣지 않습니다.

## 현재 구현

- Supabase Auth 로그인/회원가입
- AsyncStorage 기반 세션 유지
- 테스터 필수 정보 저장: 닉네임, 국내 휴대전화번호, 개인정보 동의
- 반려동물 목록, 등록, 수정, 선택
- 오늘 건강 기록 입력과 기본 안전 분류
- 사진과 동영상 첨부
- 병원 공유용 요약과 기기 공유
- 병원에서 받은 안내 체크리스트
- 3일·7일·14일과 장기 30일·60일·90일 경과 기록
- 참여코드 기반 GPT 검토용 초안과 테스터 피드백
- 계정 삭제 요청 접수

## 다음 진행 순서

1. Expo 계정 로그인 또는 `EXPO_TOKEN` 연결
2. EAS 프로젝트 생성
3. Google Play 내부 테스트용 Android preview 빌드
4. TestFlight용 iOS production 빌드
