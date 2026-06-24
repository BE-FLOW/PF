import Link from "next/link";

export default function AccountDeletionPage() {
  return (
    <main className="privacy-page">
      <div className="privacy-sheet">
        <p className="eyebrow">PETFLOW ACCOUNT</p>
        <h1>계정 및 데이터 삭제 안내</h1>
        <p>시행일: 2026년 6월 25일</p>

        <section>
          <h2>대상 앱</h2>
          <p>펫플로우(PetFlow)는 반려동물 건강 기록과 병원 공유용 요약을 돕는 테스트 서비스입니다.</p>
        </section>

        <section>
          <h2>앱에서 요청하는 방법</h2>
          <ol>
            <li>펫플로우 앱 또는 웹에서 로그인합니다.</li>
            <li>[내 계정] 화면으로 이동합니다.</li>
            <li>[계정 삭제 요청]을 누르면 운영자에게 삭제 요청이 접수됩니다.</li>
          </ol>
          <p>로그인할 수 없는 경우 kisuwo16@gmail.com 으로 계정 이메일과 함께 삭제 요청을 보내 주세요.</p>
        </section>

        <section>
          <h2>삭제되는 데이터</h2>
          <p>요청 처리 시 계정과 연결된 다음 데이터가 삭제됩니다.</p>
          <ul>
            <li>로그인 계정, 이메일, 닉네임, 휴대전화번호, 동의 기록</li>
            <li>반려동물 프로필, 건강 기록, 사진과 동영상 첨부 파일</li>
            <li>병원 공유용 요약, 경과 기록, 계획 체크 항목</li>
            <li>GPT AI 리포트 권한, 사용량, 피드백, 계정 삭제 요청 기록</li>
          </ul>
        </section>

        <section>
          <h2>보관될 수 있는 데이터</h2>
          <p>
            법적 의무, 보안 확인, 장애 대응에 필요한 최소 운영 기록은 필요한 기간 동안 보관될 수 있습니다.
            개인을 직접 식별하지 않는 집계 통계는 서비스 품질 확인 목적으로 남을 수 있습니다.
          </p>
        </section>

        <section>
          <h2>처리 기간</h2>
          <p>
            삭제 요청은 접수 후 30일 이내 처리합니다. 추가 확인이 필요한 경우 계정 이메일로 안내합니다.
          </p>
        </section>

        <div className="privacy-actions">
          <Link className="secondary-button privacy-back" href="/privacy">개인정보 안내 보기</Link>
          <Link className="secondary-button privacy-back" href="/">펫플로우로 돌아가기</Link>
        </div>
      </div>
    </main>
  );
}
