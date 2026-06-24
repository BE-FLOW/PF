import Link from "next/link";
import { testerPrivacySummary } from "@/lib/privacy";

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <div className="privacy-sheet">
        <p className="eyebrow">PETFLOW TEST</p>
        <h1>테스트 개인정보 안내</h1>
        <p>시행일: 2026년 6월 15일</p>

        <section>
          <h2>수집 정보</h2>
          <p>필수: {testerPrivacySummary.required}</p>
          <p>반려동물 이름과 건강 관찰 기록은 서비스 제공을 위해 저장됩니다.</p>
        </section>
        <section>
          <h2>이용 목적과 기간</h2>
          <p>목적: {testerPrivacySummary.purpose}</p>
          <p>보관: {testerPrivacySummary.retention}</p>
          <p>휴대전화번호는 서비스 안내와 테스트 관련 연락에만 사용하며 광고·마케팅에는 사용하지 않습니다.</p>
        </section>
        <section>
          <h2>선택과 삭제</h2>
          <p>
            주소, 위치, 실명 확인 정보는 받지 않습니다. 테스트 중 삭제가 필요하면 앱 또는 웹의
            계정 화면에서 계정 삭제 요청을 남길 수 있습니다.
          </p>
          <p>
            계정과 연결 데이터 삭제 절차는 <Link href="/account-deletion">계정 및 데이터 삭제 안내</Link>에서
            확인할 수 있습니다.
          </p>
        </section>
        <section>
          <h2>외부 서비스</h2>
          <p>계정과 데이터는 Supabase, 웹 배포는 Vercel을 사용합니다. 입력한 자유 메모와 반려동물 이름은 분석 통계 테이블에 저장하지 않습니다.</p>
        </section>

        <div className="privacy-actions">
          <Link className="secondary-button privacy-back" href="/account-deletion">계정 삭제 안내 보기</Link>
          <Link className="secondary-button privacy-back" href="/">펫플로우로 돌아가기</Link>
        </div>
      </div>
    </main>
  );
}
