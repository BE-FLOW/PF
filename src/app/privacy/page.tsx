import Link from "next/link";
import { profilePrivacySummary } from "@/lib/privacy";

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <div className="privacy-sheet">
        <p className="eyebrow">PETFLOW PRIVACY</p>
        <h1>개인정보 안내</h1>
        <p>시행일: 2026년 9월 3일</p>

        <section>
          <h2>수집 정보</h2>
          <p>필수: {profilePrivacySummary.required}</p>
          <p>
            서비스 제공을 위해 계정 식별자와 이메일, 반려동물 이름·종류를
            저장합니다.
          </p>
          <p>
            사용자가 선택해 입력하면 품종, 생일, 성별·중성화 상태, 체중,
            프로필 사진, 예방접종 이름·접종일·다음 예정일, 심장사상충 및
            내·외부 기생충 관리 완료일도 저장합니다.
          </p>
          <p>
            건강 기록에는 관찰 날짜, 보호자 메모, 선택한 증상·식욕·활력·기간,
            사진·영상, 보호자가 옮긴 병원 안내, 검사일·검사명·검사 결과 기록,
            병원명·메모와 전달본 피드백이 포함될 수 있습니다.
          </p>
        </section>
        <section>
          <h2>이용 목적과 기간</h2>
          <p>목적: {profilePrivacySummary.purpose}</p>
          <p>보관: {profilePrivacySummary.retention}</p>
        </section>
        <section>
          <h2>선택과 삭제</h2>
          <p>
            전화번호, 주소, 위치, 실명 확인 정보는 받지 않습니다. 앱 또는 웹의 계정 화면에서
            직접 계정을 탈퇴하고 연결된 데이터를 삭제할 수 있습니다.
          </p>
          <p>
            계정과 연결 데이터 삭제 절차는 <Link href="/account-deletion">계정 및 데이터 삭제 안내</Link>에서
            확인할 수 있습니다.
          </p>
        </section>
        <section>
          <h2>외부 서비스</h2>
          <p>계정과 데이터는 Supabase, 웹 배포는 Vercel을 사용합니다. 입력한 자유 메모와 반려동물 이름은 분석 통계 테이블에 저장하지 않습니다.</p>
          <p>
            사용자가 병원 전달본 만들기를 누르면 서버가 원본 기록에서 만든 사실
            문장만 OpenAI API에 전송하고, 그 문장 중 먼저 보여줄 항목의 순서만
            선택하게 합니다. 요청에는 저장 비활성화 설정을 사용하며,
            생성된 전달본은 응답 유실이나 앱 재실행 뒤에도 사용자가 다시 열 수 있도록
            PetFlow 계정에 연결해 저장합니다.
          </p>
          <p>
            현재 Android·iOS 공개판은 무료이며 인앱결제, 자동 결제와 구독을 제공하지
            않습니다. 무료 AI 생성의 공정사용 한도 확인을 위해 계정별 생성 시각과
            성공·실패 상태를 저장합니다.
          </p>
          <p>
            병원 전달본 생성·공유 여부와 피드백은 무료 서비스 품질 확인을 위한 최소
            지표로 계정에 연결해 저장합니다. 건강 기록 원문, 사진·영상과 이메일은
            이 지표에 복사하지 않으며 광고나 외부 추적에 사용하지 않습니다.
          </p>
        </section>

        <div className="privacy-actions">
          <Link className="secondary-button privacy-back" href="/account-deletion">계정 삭제 안내 보기</Link>
          <Link className="secondary-button privacy-back" href="/">펫플로우로 돌아가기</Link>
        </div>
      </div>
    </main>
  );
}
