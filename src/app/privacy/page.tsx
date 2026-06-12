import Link from "next/link";
import { testerPrivacySummary } from "@/lib/privacy";

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <div className="privacy-sheet">
        <p className="eyebrow">PETFLOW TEST</p>
        <h1>테스트 개인정보 안내</h1>
        <p>시행일: 2026년 6월 12일</p>

        <section>
          <h2>수집 정보</h2>
          <p>필수: {testerPrivacySummary.required}</p>
          <p>선택: {testerPrivacySummary.optional}</p>
          <p>반려동물 이름과 건강 관찰 기록도 서비스 제공을 위해 저장됩니다.</p>
        </section>
        <section>
          <h2>이용 목적과 기간</h2>
          <p>목적: {testerPrivacySummary.purpose}</p>
          <p>보관: {testerPrivacySummary.retention}</p>
        </section>
        <section>
          <h2>선택과 삭제</h2>
          <p>연령대와 반려 경험은 입력하지 않아도 됩니다. 테스트 중 삭제가 필요하면 운영자에게 요청할 수 있습니다.</p>
        </section>
        <section>
          <h2>외부 서비스</h2>
          <p>계정과 데이터는 Supabase, 웹 배포는 Vercel을 사용합니다. 입력한 자유 메모와 반려동물 이름은 분석 통계 테이블에 저장하지 않습니다.</p>
        </section>

        <Link className="secondary-button privacy-back" href="/">펫플로우로 돌아가기</Link>
      </div>
    </main>
  );
}
