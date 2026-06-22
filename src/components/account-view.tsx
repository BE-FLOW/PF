"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { formatKoreanMobile, normalizeKoreanMobile } from "@/lib/phone";
import { testerConsentVersion, testerPrivacySummary } from "@/lib/privacy";
import type { AiAccessStatus, PetProfile, TesterProfile } from "@/lib/types";
import { Icon } from "./icon";

type AuthMode = "login" | "signup";
type TesterDraft = Pick<
  TesterProfile,
  "nickname" | "phone" | "ageBand" | "careExperience"
>;

const emptyTesterDraft: TesterDraft = {
  nickname: "",
  phone: "",
  ageBand: "",
  careExperience: "",
};

function TesterFields({
  draft,
  setDraft,
}: {
  draft: TesterDraft;
  setDraft: (draft: TesterDraft) => void;
}) {
  return (
    <div className="tester-fields">
      <div className="field">
        <label htmlFor="testerNickname">닉네임</label>
        <input
          id="testerNickname"
          maxLength={30}
          value={draft.nickname}
          onChange={(event) => setDraft({ ...draft, nickname: event.target.value })}
          placeholder="예: 보리보호자"
        />
      </div>
      <div className="field">
        <label htmlFor="testerPhone">휴대전화번호</label>
        <input
          id="testerPhone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={formatKoreanMobile(draft.phone)}
          onChange={(event) =>
            setDraft({ ...draft, phone: formatKoreanMobile(event.target.value) })
          }
          placeholder="010-1234-5678"
        />
        <small className="field-help">서비스 안내와 테스트 관련 연락에만 사용합니다.</small>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="testerAge">연령대 (선택)</label>
          <select
            id="testerAge"
            value={draft.ageBand}
            onChange={(event) =>
              setDraft({ ...draft, ageBand: event.target.value as TesterDraft["ageBand"] })
            }
          >
            <option value="">선택 안 함</option>
            <option value="under-20">20세 미만</option>
            <option value="20s">20대</option>
            <option value="30s">30대</option>
            <option value="40s">40대</option>
            <option value="50-plus">50대 이상</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="testerExperience">반려 경험 (선택)</label>
          <select
            id="testerExperience"
            value={draft.careExperience}
            onChange={(event) =>
              setDraft({
                ...draft,
                careExperience: event.target.value as TesterDraft["careExperience"],
              })
            }
          >
            <option value="">선택 안 함</option>
            <option value="first">처음</option>
            <option value="under-3-years">3년 미만</option>
            <option value="over-3-years">3년 이상</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function PrivacyNotice() {
  return (
    <details className="privacy-notice">
      <summary>수집 정보와 이용 안내</summary>
      <dl>
        <div><dt>필수</dt><dd>{testerPrivacySummary.required}</dd></div>
        <div><dt>선택</dt><dd>{testerPrivacySummary.optional}</dd></div>
        <div><dt>목적</dt><dd>{testerPrivacySummary.purpose}</dd></div>
        <div><dt>보관</dt><dd>{testerPrivacySummary.retention}</dd></div>
      </dl>
      <p>전화번호는 광고나 마케팅에 사용하지 않습니다. 선택 정보는 입력하지 않아도 가입할 수 있습니다.</p>
      <a href="/privacy" target="_blank" rel="noreferrer">전체 테스트 개인정보 안내 보기</a>
    </details>
  );
}

function aiAccessCopy(access: AiAccessStatus | null) {
  if (!access || access.reason === "no_code") {
    return "참여코드를 입력하면 GPT 기반 수의사 검토용 리포트를 만들 수 있어요.";
  }
  if (access.reason === "monthly_limit") {
    return "이번 달 GPT 리포트 사용량을 모두 사용했어요.";
  }
  if (access.reason === "total_limit") {
    return "이 참여코드의 전체 GPT 리포트 사용량을 모두 사용했어요.";
  }
  if (access.reason === "revoked") {
    return "이 참여코드는 현재 사용할 수 없어요.";
  }
  return "GPT 기반 수의사 검토용 리포트를 만들 수 있어요.";
}

export function AccountView({
  user,
  testerProfile,
  aiAccess,
  pets,
  selectedPetId,
  authReady,
  onBack,
  onAuth,
  onSaveTesterProfile,
  onRedeemAiCode,
  onRequestAccountDeletion,
  onLogout,
  onAddPet,
  onEditPet,
  onSelectPet,
}: {
  user: User | null;
  testerProfile: TesterProfile | null;
  aiAccess: AiAccessStatus | null;
  pets: PetProfile[];
  selectedPetId?: string;
  authReady: boolean;
  onBack: () => void;
  onAuth: (
    mode: AuthMode,
    email: string,
    password: string,
    profile: TesterDraft,
    consented: boolean,
  ) => Promise<string>;
  onSaveTesterProfile: (profile: TesterDraft, consented: boolean) => Promise<string>;
  onRedeemAiCode: (code: string) => Promise<string>;
  onRequestAccountDeletion: () => Promise<string>;
  onLogout: () => Promise<void>;
  onAddPet: () => void;
  onEditPet: (pet: PetProfile) => void;
  onSelectPet: (pet: PetProfile) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [draft, setDraft] = useState<TesterDraft>(() =>
    testerProfile
      ? {
          nickname: testerProfile.nickname,
          phone: formatKoreanMobile(testerProfile.phone),
          ageBand: testerProfile.ageBand,
          careExperience: testerProfile.careExperience,
        }
      : emptyTesterDraft,
  );
  const [consented, setConsented] = useState(
    testerProfile?.consentVersion === testerConsentVersion,
  );
  const [editingTester, setEditingTester] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [aiCode, setAiCode] = useState("");
  const [aiCodeSaving, setAiCodeSaving] = useState(false);
  const [aiCodeMessage, setAiCodeMessage] = useState("");
  const [deletionSaving, setDeletionSaving] = useState(false);
  const [deletionMessage, setDeletionMessage] = useState("");
  const [deletionRequested, setDeletionRequested] = useState(false);

  const needsTesterProfile = Boolean(
    user &&
      (!testerProfile ||
        !normalizeKoreanMobile(testerProfile.phone) ||
        testerProfile.consentVersion !== testerConsentVersion),
  );
  const showTesterForm = needsTesterProfile || editingTester;

  async function submitAuth() {
    if (!email.trim() || password.length < 6) {
      setMessage("이메일과 6자 이상의 비밀번호를 입력해 주세요.");
      return;
    }
    if (
      mode === "signup" &&
      (!draft.nickname.trim() || !normalizeKoreanMobile(draft.phone) || !consented)
    ) {
      setMessage("닉네임, 010 휴대전화번호와 필수 동의를 확인해 주세요.");
      return;
    }
    setLoading(true);
    setMessage(await onAuth(mode, email.trim(), password, draft, consented));
    setLoading(false);
  }

  async function saveTester() {
    if (!draft.nickname.trim() || !normalizeKoreanMobile(draft.phone) || !consented) {
      setMessage("닉네임, 010 휴대전화번호와 필수 동의를 확인해 주세요.");
      return;
    }
    setLoading(true);
    const result = await onSaveTesterProfile(draft, consented);
    setMessage(result);
    setLoading(false);
    if (!result) setEditingTester(false);
  }

  function startEditingTester() {
    setDraft(testerProfile ?? emptyTesterDraft);
    setConsented(testerProfile?.consentVersion === testerConsentVersion);
    setMessage("");
    setEditingTester(true);
  }

  async function redeemAiCode() {
    if (!aiCode.trim()) {
      setAiCodeMessage("참여코드를 입력해 주세요.");
      return;
    }
    setAiCodeSaving(true);
    const result = await onRedeemAiCode(aiCode);
    setAiCodeSaving(false);
    setAiCodeMessage(result || "참여코드가 등록됐어요.");
    if (!result) setAiCode("");
  }

  async function requestDeletion() {
    if (deletionRequested) return;
    setDeletionSaving(true);
    const result = await onRequestAccountDeletion();
    setDeletionSaving(false);
    setDeletionMessage(
      result ||
        "계정 삭제 요청을 접수했어요. 운영자가 확인 후 테스트 데이터 삭제를 진행합니다.",
    );
    if (!result) setDeletionRequested(true);
  }

  return (
    <div className="content-wrap narrow-wrap">
      <div className="page-heading">
        <button className="back-button" onClick={onBack} aria-label="뒤로">
          <Icon name="arrow" size={20} />
        </button>
        <div>
          <p className="eyebrow">MY PETFLOW</p>
          <h1>{user ? "내 반려동물" : "계정으로 이어서 관리"}</h1>
          <p>{user ? "오늘 기록할 반려동물을 골라주세요." : "로그인하면 여러 반려동물을 한곳에서 관리할 수 있어요."}</p>
        </div>
      </div>

      {!authReady ? (
        <div className="panel account-loading">계정 확인 중...</div>
      ) : user ? (
        <div className="account-stack">
          <section className="panel account-summary">
            <div>
              <small>테스터 계정</small>
              <strong>{testerProfile?.nickname || user.email}</strong>
              {testerProfile && <span>{user.email}</span>}
            </div>
            <div className="account-actions">
              {testerProfile && <button className="text-button" onClick={startEditingTester}>정보 수정</button>}
              <button className="text-button muted" onClick={onLogout}>로그아웃</button>
            </div>
          </section>

          <section className={`panel ai-access-panel ${aiAccess?.enabled ? "enabled" : ""}`}>
            <div className="panel-head">
              <div>
                <h3>GPT AI 리포트 권한</h3>
                <p>{aiAccessCopy(aiAccess)}</p>
              </div>
              <span className={`ai-access-state ${aiAccess?.enabled ? "enabled" : ""}`}>
                {aiAccess?.enabled ? "사용 가능" : "코드 필요"}
              </span>
            </div>
            {aiAccess?.enabled ? (
              <div className="ai-usage-row">
                <div>
                  <span>이번 달</span>
                  <strong>
                    {aiAccess.usedThisMonth}/{aiAccess.monthlyReportLimit}회
                  </strong>
                </div>
                <div>
                  <span>전체</span>
                  <strong>
                    {aiAccess.usedTotal}
                    {aiAccess.totalReportLimit ? `/${aiAccess.totalReportLimit}` : ""}회
                  </strong>
                </div>
                <div>
                  <span>코드 그룹</span>
                  <strong>{aiAccess.codeLabel ?? "테스터"}</strong>
                </div>
              </div>
            ) : (
              <div className="ai-code-form">
                <input
                  value={aiCode}
                  onChange={(event) => {
                    setAiCode(event.target.value.toUpperCase());
                    setAiCodeMessage("");
                  }}
                  placeholder="PF-ABCD-1234-EFGH"
                  autoComplete="off"
                />
                <button
                  className="primary-button compact"
                  onClick={redeemAiCode}
                  disabled={aiCodeSaving}
                >
                  {aiCodeSaving ? "확인 중..." : "참여코드 등록"}
                </button>
              </div>
            )}
            {aiCodeMessage && (
              <p className={aiCodeMessage.includes("등록") ? "form-success" : "form-error"} role="alert">
                {aiCodeMessage}
              </p>
            )}
          </section>

          <section className="panel account-deletion-panel">
            <div>
              <h3>계정 삭제 요청</h3>
              <p>
                테스트를 중단하려면 요청을 남겨주세요. 운영자가 확인 후 계정과
                연결된 반려동물, 건강 기록, GPT 사용 권한을 삭제합니다.
              </p>
            </div>
            <button
              className="secondary-button compact danger-button"
              type="button"
              onClick={requestDeletion}
              disabled={deletionSaving || deletionRequested}
            >
              {deletionRequested
                ? "삭제 요청 접수됨"
                : deletionSaving
                  ? "요청 중..."
                  : "계정 삭제 요청"}
            </button>
            {deletionMessage && (
              <p
                className={deletionRequested ? "form-success" : "form-error"}
                role="alert"
              >
                {deletionMessage}
              </p>
            )}
          </section>

          {showTesterForm && (
            <section className="form-panel auth-panel">
              <h2>{needsTesterProfile ? "테스터 정보를 알려주세요" : "테스터 정보 수정"}</h2>
              <TesterFields draft={draft} setDraft={setDraft} />
              <PrivacyNotice />
              <label className="consent-check">
                <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />
                <span>휴대전화번호를 포함한 필수 개인정보 수집·이용에 동의합니다.</span>
              </label>
              {message && <div className="form-error" role="alert">{message}</div>}
              <button className="primary-button auth-submit" onClick={saveTester} disabled={loading}>
                {loading ? "저장 중..." : "저장"}
              </button>
            </section>
          )}

          {!needsTesterProfile && (
            <section className="panel">
              <div className="panel-head">
                <h3>반려동물 {pets.length}마리</h3>
                <button className="text-button" onClick={onAddPet}>+ 추가</button>
              </div>
              {pets.length ? (
                <div className="pet-list">
                  {pets.map((pet) => (
                    <div className={`pet-list-item ${pet.id === selectedPetId ? "selected" : ""}`} key={pet.id}>
                      <button className="pet-select" onClick={() => onSelectPet(pet)}>
                        <span className="pet-profile-avatar"><Icon name="paw" size={17} /></span>
                        <span>
                          <strong>{pet.name}</strong>
                          <small>{pet.species === "dog" ? "강아지" : pet.species === "cat" ? "고양이" : "기타"}{pet.breed ? ` · ${pet.breed}` : ""}</small>
                        </span>
                        {pet.id === selectedPetId && <em>선택됨</em>}
                      </button>
                      <button className="pet-edit" onClick={() => onEditPet(pet)}>수정</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state account-empty">
                  <p>아직 등록된 반려동물이 없어요.</p>
                  <button className="primary-button" onClick={onAddPet}><Icon name="plus" size={17} /> 첫 반려동물 등록</button>
                </div>
              )}
            </section>
          )}
        </div>
      ) : (
        <section className="form-panel auth-panel">
          <div className="auth-tabs">
            <button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setMessage(""); }}>로그인</button>
            <button className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setMessage(""); }}>회원가입</button>
          </div>
          <div className="field">
            <label htmlFor="authEmail">이메일</label>
            <input id="authEmail" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="test@example.com" />
          </div>
          <div className="field">
            <label htmlFor="authPassword">비밀번호</label>
            <input id="authPassword" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6자 이상" onKeyDown={(event) => { if (event.key === "Enter") void submitAuth(); }} />
          </div>
          {mode === "signup" && (
            <>
              <TesterFields draft={draft} setDraft={setDraft} />
              <PrivacyNotice />
              <label className="consent-check">
                <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />
                <span>휴대전화번호를 포함한 필수 개인정보 수집·이용에 동의합니다.</span>
              </label>
            </>
          )}
          {message && <div className="form-error" role="alert">{message}</div>}
          <button className="primary-button auth-submit" onClick={submitAuth} disabled={loading}>
            {loading ? "확인 중..." : mode === "login" ? "로그인" : "가입하고 시작"}
          </button>
        </section>
      )}
    </div>
  );
}
