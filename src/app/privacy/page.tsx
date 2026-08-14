import Link from "next/link";
import { profilePrivacySummary } from "@/lib/privacy";

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <div className="privacy-sheet">
        <p className="eyebrow">PETFLOW PRIVACY</p>
        <h1>개인정보 안내</h1>
        <p>시행일: 2026년 7월 28일</p>

        <section>
          <h2>수집 정보</h2>
          <p>필수: {profilePrivacySummary.required}</p>
          <p>반려동물 이름과 건강 관찰 기록은 서비스 제공을 위해 저장됩니다.</p>
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
            사용자가 병원 전달본 만들기를 누르면 같은 건강 흐름의 구조화 기록을
            OpenAI API에 전송해 요약합니다. 요청에는 저장 비활성화 설정을 사용하며,
            생성된 요약 원문은 PetFlow 서버에 별도로 저장하지 않습니다.
          </p>
          <p>
            병원 전달본 1회 이용권 결제는 모바일에서 Apple 또는 Google이 처리하고,
            RevenueCat이 스토어 거래를 확인합니다. PetFlow는 이용권 확인과
            환불 반영을 위해 사용자 ID, 거래 식별자, 상품, 스토어, 구매·환불
            상태와 금액을 저장하지만 카드번호나 결제수단 정보는 저장하지 않습니다.
          </p>
          <p>
            구매 화면 진입, 결제 시도·취소·실패, 병원 전달본 공유 여부는 유료 기능
            개선을 위한 최소 지표로 계정에 연결해 저장합니다. 건강 기록 원문,
            사진·영상과 이메일은 이 지표에 복사하지 않으며 광고나
            외부 추적에 사용하지 않습니다.
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
