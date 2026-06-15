"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AccountView } from "./account-view";
import { Icon, type IconName } from "./icon";
import { deriveAgeGroup, profileToHealthInput } from "@/lib/analysis";
import { summarizeHealthFlow } from "@/lib/health-flow";
import { normalizeKoreanMobile } from "@/lib/phone";
import {
  storedReportToHistoryRecord,
  type DisplayHealthReport,
} from "@/lib/report-storage";
import { testerConsentVersion } from "@/lib/privacy";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type {
  AnalysisResult,
  HealthCheckInput,
  HealthFlowSummary,
  HistoryRecord,
  Level,
  PetEpisode,
  PetProfile,
  RedFlagId,
  SymptomId,
  TesterProfile,
} from "@/lib/types";

type View = "home" | "profile" | "check" | "result" | "history" | "account";

const initialProfile: PetProfile = {
  name: "",
  species: "dog",
  breed: "",
  birthDate: "",
  sex: "unknown",
  weight: "",
};

const initialInput = profileToHealthInput(initialProfile);

const breedOptions = {
  dog: [
    "말티즈",
    "푸들",
    "포메라니안",
    "시츄",
    "비숑 프리제",
    "웰시코기",
    "골든 리트리버",
    "믹스견",
  ],
  cat: [
    "코리안 숏헤어",
    "러시안 블루",
    "페르시안",
    "샴",
    "브리티시 숏헤어",
    "랙돌",
    "믹스묘",
  ],
  other: [],
} as const;

const symptoms: Array<{ id: SymptomId; label: string; glyph: string }> = [
  { id: "vomiting", label: "구토", glyph: "V" },
  { id: "diarrhea", label: "설사", glyph: "D" },
  { id: "cough", label: "기침", glyph: "C" },
  { id: "itching", label: "가려움", glyph: "S" },
  { id: "limping", label: "절뚝거림", glyph: "L" },
  { id: "eye", label: "눈·귀 이상", glyph: "E" },
  { id: "urination", label: "배뇨 변화", glyph: "U" },
  { id: "pain", label: "통증 반응", glyph: "P" },
];

const levels: Array<{ id: Level; label: string }> = [
  { id: "normal", label: "평소와 같음" },
  { id: "slight", label: "조금 줄었음" },
  { id: "low", label: "많이 줄었음" },
  { id: "none", label: "거의 없음" },
];

const redFlags: Array<{ id: RedFlagId; label: string }> = [
  { id: "breathing", label: "호흡이 매우 힘들어 보여요" },
  { id: "collapse", label: "의식이 흐리거나 쓰러졌어요" },
  { id: "seizure", label: "경련이 있어요" },
  { id: "bleeding", label: "출혈이 멈추지 않아요" },
];

const riskLabel = {
  watch: "관찰",
  soon: "진료 권장",
  urgent: "즉시 상담",
} as const;

function toggle<T>(items: T[], item: T) {
  return items.includes(item)
    ? items.filter((value) => value !== item)
    : [...items, item];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getOrCreateClientId() {
  const storageKey = "petflow-client-id";
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) return saved;
    const created = crypto.randomUUID();
    localStorage.setItem(storageKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

async function fetchPetHistory(
  profile: PetProfile,
  accessToken: string,
): Promise<{ records: HistoryRecord[]; episodes: PetEpisode[] }> {
  if (!profile.id) return { records: [], episodes: [] };
  const response = await fetch(`/api/pets/${profile.id}/history`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return { records: [], episodes: [] };
  const payload = (await response.json()) as {
    reports: DisplayHealthReport[];
    episodes: PetEpisode[];
  };
  return {
    records: payload.reports.map((report) =>
      storedReportToHistoryRecord(report, profile),
    ),
    episodes: payload.episodes,
  };
}

function mergePetHistory(
  current: HistoryRecord[],
  remoteRecords: HistoryRecord[],
  petId: string,
) {
  const otherPets = current.filter((record) => record.petId !== petId);
  const localOnly = current.filter(
    (record) =>
      record.petId === petId &&
      !remoteRecords.some((remote) => remote.result.id === record.result.id),
  );
  const merged = [...remoteRecords, ...localOnly].sort(
    (a, b) =>
      new Date(b.result.createdAt).getTime() -
      new Date(a.result.createdAt).getTime(),
  );
  return [...merged, ...otherPets].slice(0, 100);
}

function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className="brand">
      <span className={`brand-mark ${small ? "small" : ""}`}>
        <Icon name="paw" size={small ? 18 : 20} />
      </span>
      <span>
        펫플로우<small className="brand-sub">PET HEALTH FLOW</small>
      </span>
    </div>
  );
}

function SideNav({
  view,
  setView,
  onStart,
}: {
  view: View;
  setView: (view: View) => void;
  onStart: () => void;
}) {
  const items: Array<{ id: View; label: string; icon: IconName }> = [
    { id: "home", label: "홈", icon: "home" },
    { id: "check", label: "건강 기록", icon: "plus" },
    { id: "history", label: "건강 흐름", icon: "history" },
  ];
  return (
    <aside className="desktop-sidebar">
      <Brand />
      <nav className="side-nav">
        {items.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${view === item.id || (view === "result" && item.id === "history") ? "active" : ""}`}
            onClick={() => (item.id === "check" ? onStart() : setView(item.id))}
          >
            <Icon name={item.icon} size={19} />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="side-card">
        <span className="side-card-icon">
          <Icon name="shield" size={19} />
        </span>
        <strong>기록은 보호자 중심으로</strong>
        <p>
          이 기기의 브라우저에만 최근 기록을 저장합니다. 의료 진단을 대신하지
          않아요.
        </p>
      </div>
    </aside>
  );
}

function MobileNav({
  view,
  setView,
  onStart,
}: {
  view: View;
  setView: (view: View) => void;
  onStart: () => void;
}) {
  return (
    <nav className="mobile-nav" aria-label="주요 메뉴">
      <button
        className={view === "home" ? "active" : ""}
        onClick={() => setView("home")}
      >
        <Icon name="home" size={20} />홈
      </button>
      <button className={view === "check" ? "active" : ""} onClick={onStart}>
        <Icon name="plus" size={21} />
        건강 기록
      </button>
      <button
        className={view === "history" || view === "result" ? "active" : ""}
        onClick={() => setView("history")}
      >
        <Icon name="history" size={20} />
        건강 흐름
      </button>
    </nav>
  );
}

function HomeView({
  profile,
  history,
  onStart,
  onHistory,
  onProfile,
  onAccount,
  flow,
  flowLoading,
  activeEpisode,
}: {
  profile: PetProfile;
  history: HistoryRecord[];
  onStart: () => void;
  onHistory: () => void;
  onProfile: () => void;
  onAccount: () => void;
  flow: HealthFlowSummary;
  flowLoading: boolean;
  activeEpisode?: PetEpisode;
}) {
  const recent = history[0];
  const hasProfile = Boolean(profile.name.trim());
  const ageGroup = deriveAgeGroup(profile.birthDate);
  const profileDetails = [
    profile.species === "dog"
      ? "강아지"
      : profile.species === "cat"
        ? "고양이"
        : "기타",
    profile.breed,
    profile.birthDate
      ? ageGroup === "young"
        ? "어린 반려동물"
        : ageGroup === "senior"
          ? "노령 반려동물"
          : "성견·성묘"
      : "",
  ].filter(Boolean);
  return (
    <div className="content-wrap">
      <header className="top-row">
        <div>
          <p className="eyebrow">오늘도 함께 건강하게</p>
          <h1>
            {profile.name ? `${profile.name}와` : "반려동물과"} 좋은 하루 보내고 있나요?
          </h1>
        </div>
        <div className="top-actions">
          <button className="profile-dot" onClick={onAccount} aria-label="내 계정">
            {(profile.name || "펫").slice(0, 1)}
          </button>
        </div>
      </header>
      <button
        className={`pet-profile-strip ${hasProfile ? "" : "empty"}`}
        onClick={onProfile}
      >
        <span className="pet-profile-avatar">
          <Icon name="paw" size={18} />
        </span>
        <span className="pet-profile-copy">
          <strong>
            {hasProfile ? profile.name : "반려동물을 먼저 알려주세요"}
          </strong>
          <small>
            {hasProfile
              ? profileDetails.join(" · ")
              : "한 번만 등록하면 다음부터 바로 기록할 수 있어요."}
          </small>
        </span>
        <span className="pet-profile-edit">{hasProfile ? "수정" : "등록"}</span>
      </button>
      <section className="hero-card">
        <div className="hero-content">
          <span className="hero-chip">
            <Icon name="spark" size={13} /> 3분 건강 체크
          </span>
          <h2>
            작은 변화를 기록하면
            <br />더 빠르게 알아챌 수 있어요
          </h2>
          <p>
            오늘의 식욕과 활력, 증상을 남기면
            <br />
            기록이 쌓이면 건강 흐름과 병원용 요약으로 정리해 드려요.
          </p>
          <button className="primary-button" onClick={onStart}>
            <Icon name="plus" size={18} />{" "}
            {hasProfile
              ? activeEpisode
                ? "이어서 기록하기"
                : "오늘 건강 기록하기"
              : "등록하고 시작하기"}
          </button>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="pet-orb" />
          <div className="pet-face">
            <div className="pet-ear left" />
            <div className="pet-ear right" />
            <span className="pet-eye left" />
            <span className="pet-eye right" />
            <div className="pet-muzzle">
              <div className="pet-nose" />
            </div>
          </div>
          <div className="float-badge top">
            <span className="badge-icon">
              <Icon name="heart" size={14} />
            </span>
            매일 한 번 체크
          </div>
          <div className="float-badge bottom">
            <span className="badge-icon">
              <Icon name="check" size={14} />
            </span>
            병원 준비 완료
          </div>
        </div>
      </section>
      {hasProfile && (
        <section className={`flow-card ${flow.trend}`}>
          <div className="flow-card-head">
            <div>
              <p className="eyebrow">14-DAY HEALTH FLOW</p>
              <h2>{flowLoading ? "건강 흐름을 불러오는 중..." : flow.headline}</h2>
            </div>
            <span className="flow-count">기록 {flow.recordCount}회</span>
          </div>
          {!flowLoading && (
            <>
              <p>{flow.description}</p>
              {flow.repeatedSymptoms.length > 0 && (
                <div className="flow-tags">
                  {flow.repeatedSymptoms.map((item) => <span key={item}>{item}</span>)}
                </div>
              )}
              <button className="text-button flow-link" onClick={onHistory}>
                전체 건강 흐름 보기
              </button>
            </>
          )}
        </section>
      )}
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <h3>최근 기록 한눈에 보기</h3>
            <button className="text-button" onClick={onHistory}>
              전체 보기
            </button>
          </div>
          <div className="stat-row">
            <div className="stat-card">
              <span className="stat-icon mint">
                <Icon name="calendar" size={17} />
              </span>
              <span className="stat-label">최근 기록</span>
              <strong className="stat-value">
                {history.length
                  ? formatDate(history[0].result.createdAt)
                      .split(" ")
                      .slice(0, 2)
                      .join(" ")
                  : "아직 없음"}
              </strong>
            </div>
            <div className="stat-card">
              <span className="stat-icon orange">
                <Icon name="activity" size={17} />
              </span>
              <span className="stat-label">체크 횟수</span>
              <strong className="stat-value">{history.length}회</strong>
            </div>
            <div className="stat-card">
              <span className="stat-icon lime">
                <Icon name="heart" size={17} />
              </span>
              <span className="stat-label">최근 상태</span>
              <strong className="stat-value">
                {recent ? riskLabel[recent.result.riskLevel] : "기록 전"}
              </strong>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h3>가장 최근 기록</h3>
          </div>
          {recent ? (
            <div className="timeline">
              <button
                className="timeline-item"
                onClick={onHistory}
                style={{
                  border: 0,
                  background: "transparent",
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span className="timeline-icon">
                  <Icon name="clipboard" size={17} />
                </span>
                <span>
                  <strong>오늘 건강 기록을 남겼어요</strong>
                  <span>{formatDate(recent.result.createdAt)}</span>
                </span>
                <em
                  className={`status-pill ${recent.result.riskLevel === "watch" ? "good" : "watch"}`}
                >
                  {riskLabel[recent.result.riskLevel]}
                </em>
              </button>
            </div>
          ) : (
            <div className="empty-state">
              첫 기록을 남기면 여기에 건강 흐름이 쌓여요.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ProfileView({
  profile,
  onCancel,
  onSave,
}: {
  profile: PetProfile;
  onCancel: () => void;
  onSave: (profile: PetProfile) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(profile);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const maxDate = new Date().toISOString().slice(0, 10);
  const options = breedOptions[draft.species];

  async function save() {
    if (!draft.name.trim()) {
      setError("이름만 알려주시면 바로 시작할 수 있어요.");
      return;
    }
    if (draft.birthDate && draft.birthDate > maxDate) {
      setError("생일은 오늘보다 이전 날짜로 입력해 주세요.");
      return;
    }
    setSaving(true);
    const saveError = await onSave({
      ...draft,
      name: draft.name.trim(),
      breed: draft.breed.trim(),
    });
    setSaving(false);
    if (saveError) setError(saveError);
  }

  return (
    <div className="content-wrap narrow-wrap">
      <div className="page-heading">
        <button className="back-button" onClick={onCancel} aria-label="뒤로">
          <Icon name="arrow" size={20} />
        </button>
        <div>
          <p className="eyebrow">PET PROFILE</p>
          <h1>반려동물을 알려주세요</h1>
          <p>한 번 저장하면 건강 기록 때 다시 묻지 않아요.</p>
        </div>
      </div>
      <div className="form-panel profile-panel">
        <section className="form-section">
          <div className="section-title">
            <span className="section-number">1</span>
            <div>
              <h2>이름과 종류</h2>
              <p>이 두 가지만 입력해도 시작할 수 있어요.</p>
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="profileName">이름</label>
              <input
                id="profileName"
                value={draft.name}
                maxLength={30}
                autoFocus
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                placeholder="예: 보리"
              />
            </div>
            <div className="field">
              <span className="field-label">반려동물</span>
              <div
                className="choice-grid three"
                role="group"
                aria-label="반려동물 종류 선택"
              >
                {(
                  [
                    { id: "dog", label: "강아지" },
                    { id: "cat", label: "고양이" },
                    { id: "other", label: "기타" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    className={`choice-card ${draft.species === item.id ? "selected" : ""}`}
                    onClick={() =>
                      setDraft({ ...draft, species: item.id, breed: "" })
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section className="form-section optional-section">
          <div className="section-title">
            <span className="section-number muted">선택</span>
            <div>
              <h2>알고 있는 정보만</h2>
              <p>
                생일을 입력하면 생애주기를 자동으로 맞춰요. 나중에 입력해도
                됩니다.
              </p>
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="breed">품종 (선택)</label>
              <input
                id="breed"
                list="breed-options"
                value={draft.breed}
                onChange={(event) =>
                  setDraft({ ...draft, breed: event.target.value })
                }
                placeholder={
                  draft.species === "other"
                    ? "직접 입력"
                    : "선택하거나 직접 입력"
                }
              />
              <datalist id="breed-options">
                {options.map((breed) => (
                  <option key={breed} value={breed} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="birthDate">생일 (선택)</label>
              <input
                id="birthDate"
                type="date"
                max={maxDate}
                value={draft.birthDate}
                onChange={(event) =>
                  setDraft({ ...draft, birthDate: event.target.value })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="sex">성별 (선택)</label>
              <select
                id="sex"
                value={draft.sex}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    sex: event.target.value as PetProfile["sex"],
                  })
                }
              >
                <option value="unknown">모름</option>
                <option value="male">수컷</option>
                <option value="female">암컷</option>
                <option value="neutered-male">중성화 수컷</option>
                <option value="spayed-female">중성화 암컷</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="profileWeight">최근 체중 (선택)</label>
              <input
                id="profileWeight"
                inputMode="decimal"
                value={draft.weight}
                onChange={(event) =>
                  setDraft({ ...draft, weight: event.target.value })
                }
                placeholder="예: 5.2kg"
              />
            </div>
          </div>
        </section>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-footer">
          <button className="secondary-button" onClick={onCancel}>
            취소
          </button>
          <button className="primary-button" onClick={save} disabled={saving}>
            <Icon name="check" size={17} /> {saving ? "저장 중..." : "저장하고 시작"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckView({
  input,
  setInput,
  onBack,
  onEditProfile,
  onSubmit,
  loading,
  error,
}: {
  input: HealthCheckInput;
  setInput: (value: HealthCheckInput) => void;
  onBack: () => void;
  onEditProfile: () => void;
  onSubmit: () => void;
  loading: boolean;
  error: string;
}) {
  const allNormal =
    input.symptoms.length === 0 &&
    input.appetite === "normal" &&
    input.energy === "normal" &&
    input.duration === "today" &&
    input.redFlags.length === 0 &&
    !input.note;
  const profileDetails = [
    input.species === "dog"
      ? "강아지"
      : input.species === "cat"
        ? "고양이"
        : "기타",
    input.breed,
    input.weight,
  ]
    .filter(Boolean)
    .join(" · ");
  function setNormal() {
    setInput({
      ...input,
      symptoms: [],
      appetite: "normal",
      energy: "normal",
      duration: "today",
      redFlags: [],
      note: "",
    });
  }
  return (
    <div className="content-wrap">
      <div className="page-heading">
        <button className="back-button" onClick={onBack} aria-label="뒤로">
          <Icon name="arrow" size={20} />
        </button>
        <div>
          <p className="eyebrow">HEALTH CHECK</p>
          <h1>오늘의 건강 기록</h1>
          <p>달라진 것만 골라주세요. 나머지는 평소 상태로 기록할게요.</p>
        </div>
      </div>
      <div className="progress-wrap">
        <div className="progress-labels">
          <span className="active">1. 오늘의 상태</span>
          <span>2. 리포트</span>
        </div>
        <div className="progress-track">
          <div className="progress-bar" style={{ width: "50%" }} />
        </div>
      </div>
      <div className="form-panel">
        <button className="check-profile-summary" onClick={onEditProfile}>
          <span className="pet-profile-avatar">
            <Icon name="paw" size={17} />
          </span>
          <span>
            <strong>{input.petName}</strong>
            <small>{profileDetails || "기본 정보"}</small>
          </span>
          <em>정보 수정</em>
        </button>
        <button
          className={`normal-shortcut ${allNormal ? "selected" : ""}`}
          onClick={setNormal}
          aria-pressed={allNormal}
        >
          <span className="normal-check">
            <Icon name="check" size={18} />
          </span>
          <span>
            <strong>오늘은 평소와 같아요</strong>
            <small>특별한 변화가 없다면 이것만 누르고 바로 완료하세요.</small>
          </span>
        </button>
        <section className="form-section compact-section">
          <div className="section-title">
            <span className="section-number">1</span>
            <div>
              <h2>달라진 점이 있나요?</h2>
              <p>해당하는 항목만 골라주세요.</p>
            </div>
          </div>
          <div className="field">
            <span className="field-label">주요 증상</span>
            <div className="symptom-grid">
              {symptoms.map((item) => (
                <button
                  key={item.id}
                  className={`symptom-chip ${input.symptoms.includes(item.id) ? "selected" : ""}`}
                  onClick={() =>
                    setInput({
                      ...input,
                      symptoms: toggle(input.symptoms, item.id),
                    })
                  }
                  aria-pressed={input.symptoms.includes(item.id)}
                >
                  <span className="stat-icon mint" style={{ margin: 0 }}>
                    {item.glyph}
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="form-grid" style={{ marginTop: 22 }}>
            <div className="field full">
              <span className="field-label">식욕</span>
              <div className="choice-grid" role="group" aria-label="식욕 선택">
                {levels.map((item) => (
                  <button
                    key={item.id}
                    className={`choice-card ${input.appetite === item.id ? "selected" : ""}`}
                    onClick={() => setInput({ ...input, appetite: item.id })}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field full">
              <span className="field-label">활력</span>
              <div className="choice-grid" role="group" aria-label="활력 선택">
                {levels.map((item) => (
                  <button
                    key={item.id}
                    className={`choice-card ${input.energy === item.id ? "selected" : ""}`}
                    onClick={() => setInput({ ...input, energy: item.id })}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field full">
              <span className="field-label">지속 기간</span>
              <div
                className="choice-grid"
                role="group"
                aria-label="지속 기간 선택"
              >
                {[
                  { id: "today", label: "오늘부터" },
                  { id: "2-3days", label: "2~3일" },
                  { id: "4-7days", label: "4~7일" },
                  { id: "over-week", label: "1주 이상" },
                ].map((item) => (
                  <button
                    key={item.id}
                    className={`choice-card ${input.duration === item.id ? "selected" : ""}`}
                    onClick={() =>
                      setInput({
                        ...input,
                        duration: item.id as HealthCheckInput["duration"],
                      })
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field full">
              <fieldset className="urgent-box">
                <legend>지금 보이는 위험 신호가 있나요?</legend>
                <div className="check-list">
                  {redFlags.map((item) => (
                    <label key={item.id} className="check-item">
                      <input
                        type="checkbox"
                        checked={input.redFlags.includes(item.id)}
                        onChange={() =>
                          setInput({
                            ...input,
                            redFlags: toggle(input.redFlags, item.id),
                          })
                        }
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="helper">
                하나라도 있다면 결과를 기다리지 말고 가까운 동물병원에 먼저
                연락하세요.
              </p>
            </div>
            <div className="field full">
              <label htmlFor="note">추가 메모 (선택)</label>
              <textarea
                id="note"
                maxLength={1000}
                value={input.note}
                onChange={(event) =>
                  setInput({ ...input, note: event.target.value })
                }
                placeholder="언제, 어떤 상황에서 달라졌는지만 짧게 적어도 충분해요."
              />
            </div>
          </div>
        </section>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-footer">
          <button className="secondary-button" onClick={onBack}>
            다음에 하기
          </button>
          <button
            className="primary-button"
            onClick={onSubmit}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="loading-dot" /> 리포트 정리 중
              </>
            ) : (
              <>
                <Icon name="spark" size={17} /> 기록 완료하기
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultView({
  record,
  onHome,
  onRestart,
  onFeedback,
}: {
  record: HistoryRecord;
  onHome: () => void;
  onRestart: () => void;
  onFeedback: (value: HistoryRecord["feedback"]) => void;
}) {
  const { result } = record;
  const [copied, setCopied] = useState(false);
  const [shareState, setShareState] = useState<
    "idle" | "shared" | "copied" | "failed"
  >("idle");
  async function copyBrief() {
    await navigator.clipboard.writeText(result.vetBrief);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  async function shareReport() {
    const title = `${record.input.petName || "반려동물"} 건강 리포트`;
    const text = [
      title,
      `${riskLabel[result.riskLevel]} · ${result.headline}`,
      result.summary,
      "",
      "병원에 보여줄 요약",
      result.vetBrief,
      "",
      result.disclaimer,
    ].join("\n");

    setShareState("idle");
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        setShareState("shared");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setShareState("copied");
    } catch {
      setShareState("failed");
    }
  }
  return (
    <div className="content-wrap">
      <div className="page-heading">
        <button className="back-button" onClick={onHome} aria-label="홈으로">
          <Icon name="arrow" size={20} />
        </button>
        <div>
          <p className="eyebrow">TODAY&apos;S RECORD</p>
          <h1>{record.input.petName || "반려동물"}의 오늘 기록</h1>
          <p>{formatDate(result.createdAt)} 기준 기록이에요.</p>
        </div>
      </div>
      <div className="result-layout">
        <aside className={`risk-card ${result.riskLevel}`}>
          <div
            className="risk-ring"
            style={{ "--score": result.riskScore } as React.CSSProperties}
          >
            <div className="risk-score">
              <strong>{result.riskScore}</strong>
              <span>CHECK SCORE</span>
            </div>
          </div>
          <span className="risk-label">{riskLabel[result.riskLevel]}</span>
          <h2>{result.headline}</h2>
          <p>{result.summary}</p>
          <p className="source-note">
            {result.source === "openai"
              ? "AI가 기록 문장을 정리했습니다."
              : "안전 규칙 기반으로 정리했습니다."}{" "}
            {result.storage === "remote"
              ? "구조화된 테스트 기록이 서버에 저장됐어요."
              : "이 기록은 현재 기기에만 저장돼요."}
          </p>
        </aside>
        <div className="result-stack">
          <section className="result-card">
            <h3>
              <Icon name="activity" size={18} /> 오늘 기록에서 확인한 점
            </h3>
            <ul className="bullet-list">
              {result.observations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section className="result-card">
            <h3>
              <Icon name="check" size={18} /> 지금 할 수 있는 일
            </h3>
            <ul className="bullet-list">
              {result.actions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section className="result-card">
            <h3>
              <Icon name="stethoscope" size={18} /> 병원에 보여줄 요약
            </h3>
            <div className="vet-brief">{result.vetBrief}</div>
            <div className="card-actions">
              <button className="secondary-button" onClick={shareReport}>
                <Icon
                  name={shareState === "shared" || shareState === "copied" ? "check" : "share"}
                  size={15}
                />
                {shareState === "shared"
                  ? "공유했어요"
                  : shareState === "copied"
                    ? "공유용 복사 완료"
                    : "리포트 공유"}
              </button>
              <button className="secondary-button" onClick={copyBrief}>
                <Icon name={copied ? "check" : "copy"} size={15} />
                {copied ? "복사했어요" : "요약 복사"}
              </button>
            </div>
            {shareState === "failed" && (
              <p className="share-error" role="alert">
                공유하지 못했어요. 요약 복사를 이용해 주세요.
              </p>
            )}
          </section>
          <div className="disclaimer">
            <strong>꼭 확인해 주세요.</strong> {result.disclaimer}
          </div>
          <section className="result-card">
            <div className="feedback-row">
              <p>오늘 기록 정리가 도움이 됐나요?</p>
              <div className="feedback-buttons">
                <button
                  className={`feedback-button ${record.feedback === "helpful" ? "active" : ""}`}
                  onClick={() => onFeedback("helpful")}
                >
                  도움됐어요
                </button>
                <button
                  className={`feedback-button ${record.feedback === "not-helpful" ? "active" : ""}`}
                  onClick={() => onFeedback("not-helpful")}
                >
                  아쉬워요
                </button>
              </div>
            </div>
          </section>
          <div className="result-actions">
            <button className="primary-button" onClick={onHome}>
              <Icon name="home" size={17} /> 홈으로
            </button>
            <button className="secondary-button" onClick={onRestart}>
              <Icon name="plus" size={17} />{" "}
              {record.episodeId ? "경과 이어 기록" : "새 기록 남기기"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryView({
  history,
  flow,
  episodes,
  petName,
  onBack,
  onSelect,
  onStart,
  onCloseEpisode,
  closingEpisodeId,
  episodeError,
}: {
  history: HistoryRecord[];
  flow: HealthFlowSummary;
  episodes: PetEpisode[];
  petName: string;
  onBack: () => void;
  onSelect: (record: HistoryRecord) => void;
  onStart: () => void;
  onCloseEpisode: (episodeId: string) => void;
  closingEpisodeId?: string;
  episodeError: string;
}) {
  const episodeGroups = useMemo(() => {
    const episodeById = new Map(episodes.map((episode) => [episode.id, episode]));
    const grouped = new Map<
      string,
      { episode?: PetEpisode; records: HistoryRecord[] }
    >();

    for (const record of history) {
      const key = record.episodeId ?? `record:${record.result.id}`;
      const group = grouped.get(key) ?? {
        episode: record.episodeId ? episodeById.get(record.episodeId) : undefined,
        records: [],
      };
      group.records.push(record);
      grouped.set(key, group);
    }

    return [...grouped.values()].sort((a, b) => {
      if (a.episode?.status !== b.episode?.status) {
        return a.episode?.status === "open" ? -1 : 1;
      }
      const aTime = a.episode?.lastActivityAt ?? a.records[0]?.result.createdAt ?? "";
      const bTime = b.episode?.lastActivityAt ?? b.records[0]?.result.createdAt ?? "";
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }, [episodes, history]);

  return (
    <div className="content-wrap">
      <div className="page-heading">
        <button className="back-button" onClick={onBack} aria-label="뒤로">
          <Icon name="arrow" size={20} />
        </button>
        <div>
          <p className="eyebrow">HEALTH FLOW</p>
          <h1>건강 흐름</h1>
          <p>최근 14일의 기록을 한 번에 정리했어요.</p>
        </div>
      </div>
      <section className={`flow-summary ${flow.trend}`}>
        <div>
          <span>최근 14일 · {flow.recordCount}회 기록</span>
          <h2>{flow.headline}</h2>
          <p>{flow.description}</p>
        </div>
        {flow.recordCount > 0 && <pre>{flow.vetBrief}</pre>}
      </section>
      {history.length ? (
        <div className="episode-list">
          {episodeGroups.map((group) => {
            const latest = group.records[0];
            const episodeFlow = summarizeHealthFlow(
              group.records,
              petName || "반려동물",
              new Date(latest.result.createdAt),
            );
            const isOpen = group.episode?.status === "open";
            const hasEpisode = Boolean(group.episode);
            const groupKey = group.episode?.id ?? latest.result.id;
            return (
              <section
                className={`episode-card ${isOpen ? "open" : hasEpisode ? "closed" : "standalone"}`}
                key={groupKey}
              >
                <div className="episode-head">
                  <div>
                    <span className={`episode-status ${isOpen ? "open" : "closed"}`}>
                      {isOpen ? "진행 중" : hasEpisode ? "마무리됨" : "개별 기록"}
                    </span>
                    <h2>
                      {isOpen
                        ? "진행 중인 건강 기록"
                        : `${new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(new Date(latest.result.createdAt))} 건강 기록`}
                    </h2>
                    <p>{episodeFlow.description}</p>
                  </div>
                  <div className="episode-actions">
                    <span>{group.records.length}회 기록</span>
                    {isOpen && group.episode && (
                      <button
                        className="secondary-button compact"
                        onClick={() => onCloseEpisode(group.episode?.id as string)}
                        disabled={closingEpisodeId === group.episode.id}
                      >
                        <Icon name="check" size={14} />
                        {closingEpisodeId === group.episode.id
                          ? "마무리 중..."
                          : "이번 기록 마무리"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="history-grid">
                  {group.records.map((record) => (
                    <button
                      key={record.result.id}
                      className="history-card"
                      onClick={() => onSelect(record)}
                    >
                      <span className="history-date">
                        {new Date(record.result.createdAt).getDate()}일
                      </span>
                      <span>
                        <h3>{record.result.headline}</h3>
                        <p>
                          {formatDate(record.result.createdAt)} · 증상{" "}
                          {record.input.symptoms.length}개 기록
                        </p>
                      </span>
                      <span className={`history-risk ${record.result.riskLevel}`}>
                        {riskLabel[record.result.riskLevel]}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
          {episodeError && <p className="share-error" role="alert">{episodeError}</p>}
        </div>
      ) : (
        <div
          className="panel"
          style={{ textAlign: "center", padding: "54px 20px" }}
        >
          <span className="stat-icon mint" style={{ margin: "0 auto 16px" }}>
            <Icon name="history" size={18} />
          </span>
          <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>
            아직 건강 흐름이 없어요
          </h2>
          <p style={{ fontSize: 12, color: "#81908b", margin: 0 }}>
            오늘의 작은 변화부터 기록해 보세요.
          </p>
          <button className="primary-button" onClick={onStart}>
            <Icon name="plus" size={17} /> 첫 기록 남기기
          </button>
        </div>
      )}
    </div>
  );
}

export function PetFlowApp() {
  const [view, setView] = useState<View>("home");
  const [profile, setProfile] = useState<PetProfile>(initialProfile);
  const [editingProfile, setEditingProfile] = useState<PetProfile>(initialProfile);
  const [pets, setPets] = useState<PetProfile[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string>();
  const [user, setUser] = useState<User | null>(null);
  const [testerProfile, setTesterProfile] = useState<TesterProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [input, setInput] = useState<HealthCheckInput>(initialInput);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [episodes, setEpisodes] = useState<PetEpisode[]>([]);
  const [selected, setSelected] = useState<HistoryRecord | null>(null);
  const [profileReturnView, setProfileReturnView] = useState<"home" | "check" | "account">(
    "home",
  );
  const [loading, setLoading] = useState(false);
  const [flowLoading, setFlowLoading] = useState(false);
  const [closingEpisodeId, setClosingEpisodeId] = useState<string>();
  const [episodeError, setEpisodeError] = useState("");
  const [error, setError] = useState("");
  const currentView = useMemo(
    () => (view === "result" && !selected ? "home" : view),
    [view, selected],
  );
  const visibleHistory = useMemo(() => {
    if (!user) return history.filter((record) => !record.petId);
    if (!selectedPetId) return [];
    return history.filter((record) => record.petId === selectedPetId);
  }, [history, selectedPetId, user]);
  const healthFlow = useMemo(
    () => summarizeHealthFlow(visibleHistory, profile.name || "반려동물"),
    [profile.name, visibleHistory],
  );
  const activeEpisode = useMemo(
    () => episodes.find(
      (episode) => episode.petId === selectedPetId && episode.status === "open",
    ),
    [episodes, selectedPetId],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem("petflow-history");
        const savedProfile = localStorage.getItem("petflow-profile");
        const records = saved ? (JSON.parse(saved) as HistoryRecord[]) : [];
        if (records.length) setHistory(records);
        if (savedProfile) {
          const parsed = JSON.parse(savedProfile) as PetProfile;
          setProfile(parsed);
          setInput(profileToHealthInput(parsed));
        } else if (records[0]) {
          const previous = records[0].input;
          const migrated: PetProfile = {
            name: previous.petName,
            species: previous.species,
            breed: previous.breed ?? "",
            birthDate: previous.birthDate ?? "",
            sex: previous.sex ?? "unknown",
            weight: previous.weight ?? "",
          };
          setProfile(migrated);
          setInput(profileToHealthInput(migrated));
          localStorage.setItem("petflow-profile", JSON.stringify(migrated));
        }
      } catch {
        /* Local storage is optional. */
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      const frame = window.requestAnimationFrame(() => setAuthReady(true));
      return () => window.cancelAnimationFrame(frame);
    }

    async function loadAccount(nextUser: User | null) {
      setUser(nextUser);
      if (!nextUser || !supabase) {
        setPets([]);
        setEpisodes([]);
        setTesterProfile(null);
        setSelectedPetId(undefined);
        setAuthReady(true);
        return;
      }
      const [{ data }, { data: tester }] = await Promise.all([
        supabase
          .from("pets")
          .select("id,name,species,breed,birth_date,sex,weight,created_at")
          .order("created_at", { ascending: true }),
        supabase
          .from("tester_profiles")
          .select("nickname,phone,age_band,care_experience,consent_version,consented_at,phone_consented_at")
          .maybeSingle(),
      ]);
      const loadedPets: PetProfile[] = (data ?? []).map((pet) => ({
        id: pet.id,
        name: pet.name,
        species: pet.species,
        breed: pet.breed ?? "",
        birthDate: pet.birth_date ?? "",
        sex: pet.sex,
        weight: pet.weight ?? "",
      }));
      setPets(loadedPets);
      setTesterProfile(
        tester
          ? {
              nickname: tester.nickname,
              phone: tester.phone ?? "",
              ageBand: tester.age_band ?? "",
              careExperience: tester.care_experience ?? "",
              consentVersion: tester.consent_version,
              consentedAt: tester.consented_at,
              phoneConsentedAt: tester.phone_consented_at ?? "",
            }
          : null,
      );
      const nextPet = loadedPets[0];
      if (nextPet) {
        setProfile(nextPet);
        setSelectedPetId(nextPet.id);
        setInput(profileToHealthInput(nextPet));
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session && nextPet.id) {
          const timeline = await fetchPetHistory(
            nextPet,
            sessionData.session.access_token,
          );
          setEpisodes(timeline.episodes);
          setHistory((current) =>
            mergePetHistory(current, timeline.records, nextPet.id as string),
          );
        }
      } else {
        setProfile(initialProfile);
        setInput(initialInput);
      }
      setAuthReady(true);
    }

    void supabase.auth.getUser().then(({ data }) => loadAccount(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadAccount(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  function persist(records: HistoryRecord[]) {
    setHistory(records);
    try {
      localStorage.setItem("petflow-history", JSON.stringify(records));
    } catch {
      /* Continue without persistence. */
    }
  }
  async function loadPetHistory(nextProfile: PetProfile) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !nextProfile.id) return;
    setFlowLoading(true);
    setEpisodes([]);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const timeline = await fetchPetHistory(
        nextProfile,
        data.session.access_token,
      );
      setEpisodes(timeline.episodes);
      setHistory((current) =>
        mergePetHistory(current, timeline.records, nextProfile.id as string),
      );
    } finally {
      setFlowLoading(false);
    }
  }
  function selectPet(nextProfile: PetProfile) {
    setProfile(nextProfile);
    setSelectedPetId(nextProfile.id);
    setInput(profileToHealthInput(nextProfile));
    void loadPetHistory(nextProfile);
  }
  function openProfile(
    returnTo: "home" | "check" | "account",
    target: PetProfile = profile,
  ) {
    setProfileReturnView(returnTo);
    setEditingProfile(target);
    setView("profile");
  }
  async function saveProfile(nextProfile: PetProfile): Promise<string | null> {
    const supabase = getSupabaseBrowserClient();
    let savedProfile = nextProfile;
    if (user && supabase) {
      const payload = {
        ...(nextProfile.id ? { id: nextProfile.id } : {}),
        user_id: user.id,
        name: nextProfile.name,
        species: nextProfile.species,
        breed: nextProfile.breed || null,
        birth_date: nextProfile.birthDate || null,
        sex: nextProfile.sex,
        weight: nextProfile.weight || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error: saveError } = await supabase
        .from("pets")
        .upsert(payload)
        .select("id")
        .single();
      if (saveError || !data) return "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
      savedProfile = { ...nextProfile, id: data.id };
      setPets((current) => {
        const exists = current.some((pet) => pet.id === savedProfile.id);
        return exists
          ? current.map((pet) => pet.id === savedProfile.id ? savedProfile : pet)
          : [...current, savedProfile];
      });
      setSelectedPetId(savedProfile.id);
    }
    setProfile(savedProfile);
    if (!user) {
      try {
        localStorage.setItem("petflow-profile", JSON.stringify(savedProfile));
      } catch {
        /* Continue without persistence. */
      }
    }
    const nextInput = profileToHealthInput(savedProfile);
    setInput((current) =>
      profileReturnView === "check"
        ? {
            ...current,
            petName: nextInput.petName,
            species: nextInput.species,
            breed: nextInput.breed,
            birthDate: nextInput.birthDate,
            sex: nextInput.sex,
            ageGroup: nextInput.ageGroup,
            weight: nextInput.weight,
          }
        : nextInput,
    );
    setError("");
    setView(profileReturnView);
    return null;
  }
  async function handleAuth(
    mode: "login" | "signup",
    email: string,
    password: string,
    tester: Pick<TesterProfile, "nickname" | "phone" | "ageBand" | "careExperience">,
    consented: boolean,
  ) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return "로그인 설정을 확인하고 있어요. 잠시 후 다시 시도해 주세요.";
    const result = mode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) return result.error.message === "Invalid login credentials"
      ? "이메일 또는 비밀번호를 확인해 주세요."
      : "계정을 처리하지 못했어요. 입력 내용을 확인해 주세요.";
    if (mode === "signup" && !result.data.session) {
      return "가입 확인 메일을 보냈어요. 확인 후 로그인해 주세요.";
    }
    if (mode === "signup" && result.data.user && consented) {
      const profileResult = await saveTesterProfile(tester, consented, result.data.user.id);
      if (profileResult) return profileResult;
    }
    return "";
  }
  async function saveTesterProfile(
    tester: Pick<TesterProfile, "nickname" | "phone" | "ageBand" | "careExperience">,
    consented: boolean,
    userId = user?.id,
  ) {
    const supabase = getSupabaseBrowserClient();
    const phone = normalizeKoreanMobile(tester.phone);
    if (!supabase || !userId || !consented || !tester.nickname.trim() || !phone) {
      return "필수 정보를 다시 확인해 주세요.";
    }
    const consentedAt = new Date().toISOString();
    const { error: profileError } = await supabase.from("tester_profiles").upsert({
      user_id: userId,
      nickname: tester.nickname.trim(),
      phone,
      age_band: tester.ageBand || null,
      care_experience: tester.careExperience || null,
      consent_version: testerConsentVersion,
      consented_at: consentedAt,
      phone_consented_at: consentedAt,
      updated_at: consentedAt,
    });
    if (profileError) return "테스터 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
    setTesterProfile({
      ...tester,
      nickname: tester.nickname.trim(),
      phone,
      consentVersion: testerConsentVersion,
      consentedAt,
      phoneConsentedAt: consentedAt,
    });
    return "";
  }
  async function logout() {
    const supabase = getSupabaseBrowserClient();
    await supabase?.auth.signOut();
    setProfile(initialProfile);
    setInput(initialInput);
    setPets([]);
    setEpisodes([]);
    setTesterProfile(null);
    setSelectedPetId(undefined);
    try {
      localStorage.removeItem("petflow-profile");
    } catch {
      /* Local storage is optional. */
    }
    setView("home");
  }
  function startNew() {
    if (!profile.name.trim()) {
      openProfile("check");
      return;
    }
    setInput(profileToHealthInput(profile));
    setError("");
    setView("check");
  }
  async function submit() {
    if (!input.petName.trim()) {
      setError("반려동물 이름을 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const clientId = getOrCreateClientId();
      const supabase = getSupabaseBrowserClient();
      const { data: sessionData } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-petflow-client-id": clientId,
          ...(sessionData.session?.access_token
            ? { Authorization: `Bearer ${sessionData.session.access_token}` }
            : {}),
          ...(selectedPetId ? { "x-petflow-pet-id": selectedPetId } : {}),
        },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error("analysis failed");
      const responsePayload = (await response.json()) as AnalysisResult & {
        episodeId?: string | null;
      };
      const { episodeId, ...result } = responsePayload;
      const record: HistoryRecord = {
        input,
        result,
        petId: selectedPetId,
        episodeId: episodeId ?? undefined,
      };
      persist([record, ...history].slice(0, 100));
      if (episodeId && selectedPetId) {
        setEpisodes((current) => {
          const existing = current.find((episode) => episode.id === episodeId);
          if (existing) {
            return current.map((episode) =>
              episode.id === episodeId
                ? { ...episode, lastActivityAt: result.createdAt }
                : episode,
            );
          }
          return [
            {
              id: episodeId,
              petId: selectedPetId,
              status: "open",
              startedAt: result.createdAt,
              lastActivityAt: result.createdAt,
              closedAt: null,
            },
            ...current,
          ];
        });
      }
      setSelected(record);
      setView("result");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }
  async function closeEpisode(episodeId: string) {
    const supabase = getSupabaseBrowserClient();
    setClosingEpisodeId(episodeId);
    setEpisodeError("");
    try {
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      if (!data.session) throw new Error("no session");
      const response = await fetch(`/api/episodes/${episodeId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      if (!response.ok) throw new Error("close failed");
      const payload = (await response.json()) as { episode: PetEpisode };
      setEpisodes((current) =>
        current.map((episode) =>
          episode.id === payload.episode.id ? payload.episode : episode,
        ),
      );
    } catch {
      setEpisodeError("이번 기록을 마무리하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setClosingEpisodeId(undefined);
    }
  }
  async function updateFeedback(value: HistoryRecord["feedback"]) {
    if (!selected) return;
    const updated = { ...selected, feedback: value };
    setSelected(updated);
    persist(
      history.map((item) =>
        item.result.id === updated.result.id ? updated : item,
      ),
    );
    if (!value) return;
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: updated.result.id,
          clientId: getOrCreateClientId(),
          feedback: value,
        }),
      });
    } catch {
      /* Local feedback remains available if remote sync fails. */
    }
  }

  return (
    <div className="app-shell">
      <SideNav view={currentView} setView={setView} onStart={startNew} />
      <header className="mobile-header">
        <Brand small />
        <button className="mobile-account" onClick={() => setView("account")}>내 계정</button>
      </header>
      <main className="app-main">
        {currentView === "home" && (
          <HomeView
            profile={profile}
            history={visibleHistory}
            onStart={startNew}
            onHistory={() => setView("history")}
            onProfile={() => openProfile("home")}
            onAccount={() => setView("account")}
            flow={healthFlow}
            flowLoading={flowLoading}
            activeEpisode={activeEpisode}
          />
        )}{" "}
        {currentView === "profile" && (
          <ProfileView
            profile={editingProfile}
            onCancel={() => setView(profileReturnView)}
            onSave={saveProfile}
          />
        )}{" "}
        {currentView === "account" && (
          <AccountView
            key={`${user?.id ?? "guest"}:${testerProfile?.consentVersion ?? "none"}:${testerProfile?.phone ?? "none"}`}
            user={user}
            testerProfile={testerProfile}
            pets={pets}
            selectedPetId={selectedPetId}
            authReady={authReady}
            onBack={() => setView("home")}
            onAuth={handleAuth}
            onSaveTesterProfile={saveTesterProfile}
            onLogout={logout}
            onAddPet={() => openProfile("account", initialProfile)}
            onEditPet={(pet) => openProfile("account", pet)}
            onSelectPet={(pet) => { selectPet(pet); setView("home"); }}
          />
        )}{" "}
        {currentView === "check" && (
          <CheckView
            input={input}
            setInput={setInput}
            onBack={() => setView("home")}
            onEditProfile={() => openProfile("check")}
            onSubmit={submit}
            loading={loading}
            error={error}
          />
        )}{" "}
        {currentView === "result" && selected && (
          <ResultView
            record={selected}
            onHome={() => setView("home")}
            onRestart={startNew}
            onFeedback={updateFeedback}
          />
        )}{" "}
        {currentView === "history" && (
          <HistoryView
            history={visibleHistory}
            flow={healthFlow}
            episodes={episodes}
            petName={profile.name}
            onBack={() => setView("home")}
            onStart={startNew}
            onCloseEpisode={closeEpisode}
            closingEpisodeId={closingEpisodeId}
            episodeError={episodeError}
            onSelect={(record) => {
              setSelected(record);
              setView("result");
            }}
          />
        )}
      </main>
      <MobileNav view={currentView} setView={setView} onStart={startNew} />
    </div>
  );
}
