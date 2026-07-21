"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import type { User } from "@supabase/supabase-js";
import { AccountView } from "./account-view";
import { Icon, type IconName } from "./icon";
import {
  analyzeLocally,
  dailyObservationOptions,
  deriveAgeGroup,
  hasDailyObservation,
  profileToHealthInput,
  toggleDailyObservation,
} from "@/lib/analysis";
import { buildEpisodeReport } from "@/lib/episode-report";
import { summarizeHealthFlow } from "@/lib/health-flow";
import {
  buildRecordCalendar,
  isRecordDateInRange,
  monthKeyFromDate,
  normalizeRecordDateRange,
  recordDateKeyToIso,
  shiftRecordMonth,
  toRecordDateKey,
} from "@/lib/record-calendar";
import {
  oauthLinkErrorMessage,
  oauthSignInErrorMessage,
  passwordAuthErrorMessage,
  type OAuthProvider,
} from "@/lib/auth-identities";
import { normalizeKoreanMobile } from "@/lib/phone";
import {
  storedReportToHistoryRecord,
  type DisplayHealthReport,
} from "@/lib/report-storage";
import {
  formatReportMediaCount,
  formatReportMediaSummary,
  maxReportMediaFiles,
  maxReportMediaSizeBytes,
  reportMediaAccept,
  reportMediaBucket,
  reportMediaExtensionFromMimeType,
  reportMediaKindFromMimeType,
} from "@/lib/report-media";
import {
  isAllowedPetPhotoMimeType,
  maxPetPhotoSizeBytes,
  petPhotoAccept,
  petPhotoBucket,
  petPhotoExtensionFromMimeType,
} from "@/lib/pet-photo";
import { testerConsentVersion } from "@/lib/privacy";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type {
  AiAccessStatus,
  AiReportFeedbackInput,
  AnalysisResult,
  ConditionChange,
  EpisodePlan,
  EpisodeProgress,
  FollowUpDay,
  HealthCheckInput,
  HealthFlowSummary,
  HistoryRecord,
  Level,
  PetEpisode,
  PetProfile,
  ReportMediaAttachment,
  ReportMediaKind,
  RiskLevel,
  TesterProfile,
  VaccinationRecord,
  VetReviewDraft,
} from "@/lib/types";
import {
  hasVaccinationDraft,
  vaccinationDraftFromRecords,
  vaccinationReminder,
  type VaccinationDraft,
} from "@/lib/vaccinations";
import {
  isMissingVaccinationTableError,
  toVaccinationRecord,
  vaccinationSelectColumns,
  type VaccinationRow,
} from "@/lib/vaccination-storage";

type View =
  | "home"
  | "profile"
  | "check"
  | "result"
  | "history"
  | "episode-report"
  | "account";

type ViewNavigationMode = "push" | "replace" | "none";
type SetView = (
  view: View,
  options?: { history?: ViewNavigationMode },
) => void;

interface EpisodeReportSelection {
  episode?: PetEpisode;
  records: HistoryRecord[];
}

interface PendingMediaFile {
  id: string;
  file: File;
  kind: ReportMediaKind;
  previewUrl: string;
}

interface PetPhotoChange {
  file: File | null;
  remove: boolean;
}

const views: View[] = [
  "home",
  "profile",
  "check",
  "result",
  "history",
  "episode-report",
  "account",
];

function isView(value: unknown): value is View {
  return typeof value === "string" && views.includes(value as View);
}

function hasObservationDraft(input: HealthCheckInput) {
  return Boolean(
    input.symptoms.length ||
      input.redFlags.length ||
      input.appetite !== "normal" ||
      input.energy !== "normal" ||
      input.duration !== "today" ||
      input.note.trim(),
  );
}

const initialProfile: PetProfile = {
  name: "",
  species: "dog",
  breed: "",
  birthDate: "",
  sex: "unknown",
  weight: "",
  photoPath: "",
  photoUrl: "",
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

const levels: Array<{ id: Level; label: string }> = [
  { id: "normal", label: "평소와 같음" },
  { id: "slight", label: "조금 줄었음" },
  { id: "low", label: "많이 줄었음" },
  { id: "none", label: "거의 없음" },
];

const riskLabel = {
  watch: "관찰",
  soon: "진료 권장",
  urgent: "즉시 상담",
} as const;

const conditionChangeOptions: Array<{
  id: ConditionChange;
  label: string;
  description: string;
}> = [
  { id: "better", label: "좋아졌어요", description: "전보다 편안해 보여요" },
  { id: "same", label: "비슷해요", description: "큰 변화가 없어요" },
  { id: "worse", label: "나빠졌어요", description: "불편함이 더 보여요" },
];

const followUpGroups: Array<{
  title: string;
  description: string;
  days: FollowUpDay[];
}> = [
  {
    title: "초기 경과",
    description: "진료 직후 다시 설명해야 하는 변화를 3·7·14일에 정리해요.",
    days: [3, 7, 14],
  },
  {
    title: "장기 경과",
    description: "다른 병원 방문이나 재진 때 필요한 큰 흐름을 30·60·90일에 남겨요.",
    days: [30, 60, 90],
  },
];

function conditionChangeLabel(value: ConditionChange) {
  return conditionChangeOptions.find((option) => option.id === value)?.label ?? "비슷해요";
}

function levelLabel(value: Level) {
  return levels.find((option) => option.id === value)?.label ?? "평소와 같음";
}

function displayCheckScore(riskScore: number) {
  if (!Number.isFinite(riskScore)) return 0;
  return Math.max(0, Math.min(100, Math.round(100 - riskScore)));
}

function avatarLabel(value: string, fallback = "펫") {
  return Array.from(value.trim() || fallback).slice(0, 2).join("");
}

function PetProfileAvatar({
  className = "pet-profile-avatar",
  iconSize = 18,
  pet,
}: {
  className?: string;
  iconSize?: number;
  pet: Pick<PetProfile, "name" | "photoUrl">;
}) {
  if (pet.photoUrl) {
    return (
      <span className={`${className} has-photo`}>
        <img src={pet.photoUrl} alt={`${pet.name || "반려동물"} 사진`} />
      </span>
    );
  }

  return (
    <span className={className}>
      {pet.name ? avatarLabel(pet.name) : <Icon name="paw" size={iconSize} />}
    </span>
  );
}

function HeroPetPhoto({ pet }: { pet: PetProfile }) {
  if (pet.photoUrl) {
    return (
      <img
        src={pet.photoUrl}
        alt={`${pet.name || "반려동물"} 사진`}
        className="hero-pet-photo"
      />
    );
  }

  return <span>{pet.name ? avatarLabel(pet.name) : <Icon name="paw" size={24} />}</span>;
}

function followUpDate(startedAt: string, day: FollowUpDay) {
  const date = new Date(startedAt);
  date.setDate(date.getDate() + day);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function dateFromRecordKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00+09:00`);
}

function formatRecordMonth(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year}년 ${month}월`;
}

function formatRecordDateKey(dateKey: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(dateFromRecordKey(dateKey));
}

function formatRecordRange(start: string, end: string | null) {
  if (!end || start === end) return formatRecordDateKey(start);
  const startLabel = new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
  }).format(dateFromRecordKey(start));
  return `${startLabel}–${formatRecordDateKey(end)}`;
}

const recordRiskWeight: Record<RiskLevel, number> = {
  watch: 1,
  soon: 2,
  urgent: 3,
};

function highestRecordRisk(records: HistoryRecord[]) {
  return records.reduce<RiskLevel | null>((highest, record) => {
    if (!highest) return record.result.riskLevel;
    return recordRiskWeight[record.result.riskLevel] > recordRiskWeight[highest]
      ? record.result.riskLevel
      : highest;
  }, null);
}

function isToday(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date) === formatter.format(new Date());
}

function recordDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "기록";
  if (isToday(value)) return "오늘 기록";
  return `${new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
  }).format(date)} 기록`;
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

function mediaExtension(file: File) {
  const extensionFromName = file.name
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  if (extensionFromName) return extensionFromName;
  return reportMediaExtensionFromMimeType(file.type);
}

function petPhotoExtension(file: File) {
  const extensionFromName = file.name
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  if (extensionFromName && ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(extensionFromName)) {
    return extensionFromName === "jpeg" ? "jpg" : extensionFromName;
  }
  return petPhotoExtensionFromMimeType(file.type);
}

async function createPetPhotoSignedUrl(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  photoPath?: string | null,
) {
  if (!photoPath) return "";
  const { data, error } = await supabase.storage
    .from(petPhotoBucket)
    .createSignedUrl(photoPath, 60 * 60);
  if (error) return "";
  return data.signedUrl ?? "";
}

function isMissingPetPhotoColumnError(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : "";
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  return code === "42703" || message.includes("photo_path");
}

function MediaThumbnail({
  kind,
  label,
  src,
  videoControls = false,
}: {
  kind: ReportMediaKind;
  label: string;
  src?: string;
  videoControls?: boolean;
}) {
  if (!src) return <span>{kind === "image" ? "사진" : "영상"}</span>;

  if (kind === "image") {
    return (
      <span
        className="media-image-thumb"
        role="img"
        aria-label={label}
        style={{ backgroundImage: `url(${JSON.stringify(src)})` }}
      />
    );
  }

  return (
    <video
      src={src}
      controls={videoControls}
      muted={!videoControls}
      playsInline
      preload="metadata"
    />
  );
}

function HistoryMediaPreview({ media = [] }: { media?: ReportMediaAttachment[] }) {
  const [open, setOpen] = useState(false);
  if (!media.length) return null;

  const mediaSummary = formatReportMediaSummary(media);

  return (
    <div className={`history-media ${open ? "open" : ""}`}>
      <button
        type="button"
        className="history-media-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? `${mediaSummary} 접기` : `${mediaSummary} 보기`}
      </button>
      {open && (
        <div className="history-media-grid">
          {media.map((item) => (
            <div className="history-media-card" key={item.id}>
              <div className="history-media-thumb">
                <MediaThumbnail
                  kind={item.kind}
                  label={item.fileName}
                  src={item.signedUrl}
                  videoControls
                />
              </div>
              <span>
                <strong>{item.fileName}</strong>
                <small>
                  {item.kind === "image" ? "사진" : "영상"} ·{" "}
                  {formatFileSize(item.sizeBytes)}
                </small>
                {item.signedUrl && (
                  <a href={item.signedUrl} target="_blank" rel="noreferrer">
                    크게 보기
                  </a>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("copy failed");
  }
}

async function fetchPetHistory(
  profile: PetProfile,
  accessToken: string,
): Promise<{
  records: HistoryRecord[];
  episodes: PetEpisode[];
  plans: EpisodePlan[];
  progress: EpisodeProgress[];
}> {
  if (!profile.id) {
    return { records: [], episodes: [], plans: [], progress: [] };
  }
  const response = await fetch(`/api/pets/${profile.id}/history`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    return { records: [], episodes: [], plans: [], progress: [] };
  }
  const payload = (await response.json()) as {
    reports: DisplayHealthReport[];
    episodes: PetEpisode[];
    plans: EpisodePlan[];
    progress: EpisodeProgress[];
  };
  return {
    records: payload.reports.map((report) =>
      storedReportToHistoryRecord(report, profile),
    ),
    episodes: payload.episodes,
    plans: payload.plans,
    progress: payload.progress,
  };
}

async function fetchAiAccessStatus(
  accessToken: string,
): Promise<AiAccessStatus | null> {
  const response = await fetch("/api/ai-access", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { access: AiAccessStatus };
  return payload.access;
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
  const merged = sortHistoryRecords([...remoteRecords, ...localOnly]);
  return [...merged, ...otherPets].slice(0, 100);
}

function sortHistoryRecords(records: HistoryRecord[]) {
  return [...records].sort(
    (a, b) =>
      new Date(b.result.createdAt).getTime() -
      new Date(a.result.createdAt).getTime(),
  );
}

function ignoreLocalStorageFailure(action: () => void) {
  try {
    action();
  } catch {
    /* Local storage can fail; in-memory state still keeps the flow usable. */
  }
}

function setLocalStorageItem(key: string, value: string) {
  ignoreLocalStorageFailure(() => localStorage.setItem(key, value));
}

function removeLocalStorageItem(key: string) {
  ignoreLocalStorageFailure(() => localStorage.removeItem(key));
}

function Brand({
  small = false,
  onClick,
}: {
  small?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true" />
      <span>
        펫플로우<small className="brand-sub">PET FLOW</small>
      </span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className="brand brand-button"
        onClick={onClick}
        aria-label="홈으로 이동"
      >
        {content}
      </button>
    );
  }
  return (
    <div className="brand">
      {content}
    </div>
  );
}

function SideNav({
  view,
  setView,
  onStart,
  onAccount,
  authReady,
  signedIn,
  canUseApp,
}: {
  view: View;
  setView: SetView;
  onStart: () => void;
  onAccount: () => void;
  authReady: boolean;
  signedIn: boolean;
  canUseApp: boolean;
}) {
  const items: Array<{ id: View; label: string; icon: IconName }> = [
    { id: "home", label: "홈", icon: "home" },
    ...(canUseApp
      ? [
          { id: "check" as const, label: "건강 기록", icon: "plus" as const },
          { id: "history" as const, label: "건강 흐름", icon: "history" as const },
        ]
      : []),
  ];
  return (
    <aside className="desktop-sidebar">
      <Brand onClick={() => setView("home", { history: "replace" })} />
      <nav className="side-nav">
        {items.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${view === item.id || (["result", "episode-report"].includes(view) && item.id === "history") ? "active" : ""}`}
            onClick={() =>
              item.id === "check"
                ? onStart()
                : setView(item.id, { history: "replace" })
            }
          >
            <Icon name={item.icon} size={19} />
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className={`nav-item account-nav ${view === "account" ? "active" : ""}`}
          onClick={onAccount}
          aria-label={authReady && signedIn ? "내 계정" : "로그인"}
        >
          <Icon name="user" size={19} />
          <span>{authReady ? (signedIn ? "내 계정" : "로그인") : "계정 확인 중"}</span>
          {authReady && (
            <small className={signedIn ? "connected" : ""}>
              {signedIn ? "연결됨" : "시작"}
            </small>
          )}
        </button>
      </nav>
      <div className="side-card">
        <span className="side-card-icon">
          <Icon name="shield" size={19} />
        </span>
        <strong>기록은 보호자 중심으로</strong>
        <p>
          로그인 기록은 계정에 동기화됩니다. 보호자 관찰을 정리할 뿐 의료
          진단을 대신하지 않아요.
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
  setView: SetView;
  onStart: () => void;
}) {
  return (
    <nav className="mobile-nav" aria-label="주요 메뉴">
      <button
        className={view === "home" ? "active" : ""}
        onClick={() => setView("home", { history: "replace" })}
      >
        <Icon name="home" size={20} />홈
      </button>
      <button className={view === "check" ? "active" : ""} onClick={onStart}>
        <Icon name="plus" size={21} />
        건강 기록
      </button>
      <button
        className={
          view === "history" || view === "result" || view === "episode-report"
            ? "active"
            : ""
        }
        onClick={() => setView("history", { history: "replace" })}
      >
        <Icon name="history" size={20} />
        건강 흐름
      </button>
    </nav>
  );
}

type HomeStage = "account" | "pet" | "record";

const homeStageSteps: Array<{ id: HomeStage; label: string }> = [
  { id: "account", label: "계정" },
  { id: "pet", label: "아이 등록" },
  { id: "record", label: "첫 기록" },
];

function HomeSteps({ current }: { current: HomeStage }) {
  const currentIndex = homeStageSteps.findIndex((step) => step.id === current);
  return (
    <ol className="home-steps" aria-label="펫플로우 시작 순서">
      {homeStageSteps.map((step, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li className={`${complete ? "complete" : ""} ${active ? "active" : ""}`} key={step.id}>
            <span>{complete ? <Icon name="check" size={13} /> : index + 1}</span>
            <strong>{step.label}</strong>
          </li>
        );
      })}
    </ol>
  );
}

function HomeSetup({
  stage,
  onAction,
  onLogin,
  onSignup,
}: {
  stage: "login" | "account" | "pet";
  onAction: () => void;
  onLogin: () => void;
  onSignup: () => void;
}) {
  const loginStage = stage === "login";
  const accountStage = stage === "account";
  const currentStep: HomeStage = stage === "pet" ? "pet" : "account";
  return (
    <div className="content-wrap home-setup-wrap">
      <header className="home-page-heading">
        <p className="eyebrow">PET FLOW HOME</p>
        <h1>
          {loginStage
            ? "건강 기록을 이어서 관리해요"
            : accountStage
              ? "계정 준비를 마무리해요"
              : "함께 기록할 아이를 알려주세요"}
        </h1>
      </header>
      <HomeSteps current={currentStep} />
      <section className={`home-setup-card ${stage}`}>
        <div className="home-setup-copy">
          <span className="home-stage-label">
            {loginStage
              ? "1단계 · 계정"
              : accountStage
                ? "로그인 완료 · 정보 확인"
                : "2단계 · 아이 등록"}
          </span>
          <h2>
            {loginStage
              ? "계정으로 시작해 주세요"
              : accountStage
                ? "필수 정보를 한 번만 확인해요"
                : "이름과 종류부터 시작해요"}
          </h2>
          <p>
            {loginStage
              ? "기존 계정은 로그인, 처음이라면 회원가입을 선택해요."
              : accountStage
                ? "닉네임과 연락처를 확인하면 다음 단계로 이어져요."
                : "기본 정보만 등록하면 바로 건강 기록을 남길 수 있어요."}
          </p>
          {loginStage ? (
            <div className="home-auth-actions">
              <button className="primary-button" type="button" onClick={onLogin}>
                <Icon name="user" size={18} /> 로그인
              </button>
              <button className="secondary-button" type="button" onClick={onSignup}>
                <Icon name="plus" size={17} /> 회원가입
              </button>
            </div>
          ) : (
            <button className="primary-button" type="button" onClick={onAction}>
              <Icon name={accountStage ? "user" : "paw"} size={18} />
              {accountStage ? "정보 확인하기" : "첫 아이 등록"}
            </button>
          )}
        </div>
        <span className="home-setup-symbol" aria-hidden="true">
          <Icon name={loginStage || accountStage ? "shield" : "paw"} size={38} />
        </span>
      </section>
    </div>
  );
}

function HomeView({
  authReady,
  signedIn,
  accountComplete,
  profile,
  history,
  onStart,
  onHistory,
  onProfile,
  flow,
  flowLoading,
  activeEpisode,
  activeEpisodeProgressCount,
  vaccinations,
  onAccount,
  onLogin,
  onSignup,
}: {
  authReady: boolean;
  signedIn: boolean;
  accountComplete: boolean;
  profile: PetProfile;
  history: HistoryRecord[];
  onStart: () => void;
  onHistory: () => void;
  onProfile: () => void;
  flow: HealthFlowSummary;
  flowLoading: boolean;
  activeEpisode?: PetEpisode;
  activeEpisodeProgressCount: number;
  vaccinations: VaccinationRecord[];
  onAccount: () => void;
  onLogin: () => void;
  onSignup: () => void;
}) {
  const recent = history[0];
  const recentCheckScore = recent ? displayCheckScore(recent.result.riskScore) : undefined;
  const hasProfile = Boolean(profile.name.trim());
  const vaccination = vaccinationReminder(vaccinations);
  const activeEpisodeRecordCount = activeEpisode
    ? history.filter((record) => record.episodeId === activeEpisode.id).length
    : 0;
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
  if (!authReady) {
    return (
      <div className="content-wrap home-setup-wrap" aria-live="polite">
        <section className="home-loading-card">
          <span className="home-loading-dot" aria-hidden="true" />
          <div>
            <strong>계정 상태를 확인하고 있어요</strong>
            <p>잠시만 기다려 주세요.</p>
          </div>
        </section>
      </div>
    );
  }
  if (!signedIn) {
    return (
      <HomeSetup
        stage="login"
        onAction={onAccount}
        onLogin={onLogin}
        onSignup={onSignup}
      />
    );
  }
  if (!accountComplete) {
    return (
      <HomeSetup
        stage="account"
        onAction={onAccount}
        onLogin={onLogin}
        onSignup={onSignup}
      />
    );
  }
  if (!hasProfile) {
    return (
      <HomeSetup
        stage="pet"
        onAction={onProfile}
        onLogin={onLogin}
        onSignup={onSignup}
      />
    );
  }

  return (
    <div className="content-wrap home-dashboard-compact">
      <section className="hero-card">
        <div className="hero-content">
          <h1>{recent ? "오늘 상태" : "첫 기록"}</h1>
          <button className="primary-button" onClick={onStart}>
            <Icon name="plus" size={18} />{" "}
            {recent
              ? activeEpisode
                ? "이어서 기록"
                : "오늘 기록하기"
              : "첫 기록 시작"}
          </button>
          <div className="hero-status-row">
            {hasProfile && activeEpisode && (
              <button className="hero-inline-status" type="button" onClick={onHistory}>
                <span>진행 중</span>
                <strong>
                  기록 {Math.max(activeEpisodeRecordCount, 1)}회 · 경과{" "}
                  {Math.min(activeEpisodeProgressCount, 3)}/3
                </strong>
              </button>
            )}
            {hasProfile && vaccination.record && (
              <button
                className={`hero-inline-status vaccination ${vaccination.tone}`}
                type="button"
                onClick={onProfile}
              >
                <span>{vaccination.label}</span>
                <strong>{vaccination.title}</strong>
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onProfile}
          aria-label={hasProfile ? `${profile.name} 프로필 수정` : "반려동물 등록"}
          className={`hero-profile-panel ${hasProfile ? "" : "empty"}`}
        >
          <span className={`hero-pet-photo-slot ${profile.photoUrl ? "has-photo" : ""}`}>
            <HeroPetPhoto pet={profile} />
          </span>
          <span className="hero-profile-row">
            <span className="hero-profile-copy">
              <strong>
                {hasProfile ? profile.name : "반려동물 등록"}
              </strong>
              <small>
                {hasProfile
                  ? profileDetails.join(" · ")
                  : "사진과 정보를 한 번만 알려주세요."}
              </small>
            </span>
            <span className="hero-profile-action">
              {hasProfile ? "수정" : "등록"}
            </span>
          </span>
        </button>
      </section>
      {recent && <section className={`home-score-card ${recent.result.riskLevel}`}>
        <div className="home-score-copy">
          <p className="eyebrow">현재 상태</p>
          <h2>{riskLabel[recent.result.riskLevel]}</h2>
          <p>
            {formatDate(recent.result.createdAt)} · 최근 14일 {flow.recordCount}회
          </p>
          {!flowLoading && <strong className="home-flow-summary">{flow.headline}</strong>}
          <button className="text-button flow-link" onClick={onHistory}>
            건강 흐름 보기
          </button>
        </div>
        <div
          className="home-score-badge"
          style={{ "--score": recentCheckScore } as React.CSSProperties}
          aria-label={`체크스코어 ${recentCheckScore}`}
        >
          <strong>{recentCheckScore}</strong>
          <span>CHECK SCORE</span>
        </div>
      </section>}
    </div>
  );
}

function ProfileView({
  profile,
  vaccinations,
  onCancel,
  onSave,
}: {
  profile: PetProfile;
  vaccinations: VaccinationRecord[];
  onCancel: () => void;
  onSave: (
    profile: PetProfile,
    photo: PetPhotoChange,
    vaccination: VaccinationDraft,
  ) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(profile);
  const [vaccinationDraft, setVaccinationDraft] = useState(
    vaccinationDraftFromRecords(vaccinations),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(profile.photoUrl ?? "");
  const [removePhoto, setRemovePhoto] = useState(false);
  const [breedPickerOpen, setBreedPickerOpen] = useState(false);
  const [highlightedBreedIndex, setHighlightedBreedIndex] = useState(0);
  const maxDate = new Date().toISOString().slice(0, 10);
  const options = breedOptions[draft.species];
  const breedQuery = draft.breed.trim().toLowerCase();
  const visibleBreedOptions = breedQuery
    ? options.filter((breed) => breed.toLowerCase().includes(breedQuery))
    : options;
  const activeBreedIndex = Math.min(
    highlightedBreedIndex,
    Math.max(visibleBreedOptions.length - 1, 0),
  );
  const selectedBreed = draft.breed.trim();

  useEffect(() => {
    return () => {
      if (photoPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  function setNextPhotoPreview(nextUrl: string) {
    setPhotoPreviewUrl((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current);
      return nextUrl;
    });
  }

  function changePhoto(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    if (!isAllowedPetPhotoMimeType(file.type)) {
      setError("프로필 사진은 JPG, PNG, WEBP, HEIC 이미지만 사용할 수 있어요.");
      return;
    }
    if (file.size > maxPetPhotoSizeBytes) {
      setError("프로필 사진은 5MB 이하로 올려 주세요.");
      return;
    }
    setError("");
    setPhotoFile(file);
    setRemovePhoto(false);
    setNextPhotoPreview(URL.createObjectURL(file));
  }

  function clearPhoto() {
    setPhotoFile(null);
    setRemovePhoto(Boolean(draft.photoPath));
    setNextPhotoPreview("");
    setDraft((current) => ({ ...current, photoUrl: "", photoPath: current.photoPath }));
  }

  function chooseBreed(breed: string) {
    setDraft((current) => ({ ...current, breed }));
    setBreedPickerOpen(false);
    setHighlightedBreedIndex(0);
  }

  function closeBreedPickerOnBlur(event: FocusEvent<HTMLDivElement>) {
    const nextFocus = event.relatedTarget;
    if (
      !(nextFocus instanceof Node) ||
      !event.currentTarget.contains(nextFocus)
    ) {
      setBreedPickerOpen(false);
    }
  }

  function handleBreedKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!options.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setBreedPickerOpen(true);
      setHighlightedBreedIndex((current) =>
        visibleBreedOptions.length
          ? (current + 1) % visibleBreedOptions.length
          : 0,
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setBreedPickerOpen(true);
      setHighlightedBreedIndex((current) =>
        visibleBreedOptions.length
          ? (current - 1 + visibleBreedOptions.length) % visibleBreedOptions.length
          : 0,
      );
      return;
    }
    if (event.key === "Enter" && breedPickerOpen && visibleBreedOptions.length) {
      event.preventDefault();
      chooseBreed(visibleBreedOptions[activeBreedIndex]);
      return;
    }
    if (event.key === "Escape") {
      setBreedPickerOpen(false);
    }
  }

  async function save() {
    if (!draft.name.trim()) {
      setError("이름만 알려주시면 바로 시작할 수 있어요.");
      return;
    }
    if (draft.birthDate && draft.birthDate > maxDate) {
      setError("생일은 오늘보다 이전 날짜로 입력해 주세요.");
      return;
    }
    if (hasVaccinationDraft(vaccinationDraft)) {
      if (!vaccinationDraft.name.trim()) {
        setError("예방접종 이름을 입력해 주세요.");
        return;
      }
      if (!vaccinationDraft.administeredAt && !vaccinationDraft.dueAt) {
        setError("접종일 또는 다음 예정일 중 하나는 입력해 주세요.");
        return;
      }
    }
    setSaving(true);
    const saveError = await onSave({
      ...draft,
      name: draft.name.trim(),
      breed: draft.breed.trim(),
      photoUrl: removePhoto ? "" : draft.photoUrl,
      photoPath: removePhoto ? "" : draft.photoPath,
    }, {
      file: photoFile,
      remove: removePhoto,
    }, vaccinationDraft);
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
          <div className="profile-photo-editor">
            <div className={`profile-photo-preview ${photoPreviewUrl ? "has-photo" : ""}`}>
              {photoPreviewUrl ? (
                <img src={photoPreviewUrl} alt={`${draft.name || "반려동물"} 프로필 사진`} />
              ) : (
                <span>{draft.name ? avatarLabel(draft.name) : <Icon name="paw" size={24} />}</span>
              )}
            </div>
            <div className="profile-photo-copy">
              <strong>프로필 사진</strong>
              <p>선택 사항이에요. 넣으면 홈에서 아이를 더 빨리 알아볼 수 있어요.</p>
              <div className="profile-photo-actions">
                <label className="secondary-button compact photo-file-button">
                  사진 선택
                  <input
                    type="file"
                    accept={petPhotoAccept}
                    onChange={(event) => changePhoto(event.target.files)}
                  />
                </label>
                {(photoPreviewUrl || draft.photoPath) && (
                  <button type="button" className="text-button" onClick={clearPhoto}>
                    사진 지우기
                  </button>
                )}
              </div>
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
                    type="button"
                    key={item.id}
                    className={`choice-card ${draft.species === item.id ? "selected" : ""}`}
                    onClick={() => {
                      setDraft({ ...draft, species: item.id, breed: "" });
                      setBreedPickerOpen(false);
                      setHighlightedBreedIndex(0);
                    }}
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
            <div className="field breed-field">
              <label htmlFor="breed">품종</label>
              <div
                className={`breed-combobox ${breedPickerOpen ? "open" : ""}`}
                onBlur={closeBreedPickerOnBlur}
              >
                <div className="breed-input-row">
                  <input
                    id="breed"
                    value={draft.breed}
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={breedPickerOpen}
                    aria-controls="breed-options"
                    aria-activedescendant={
                      breedPickerOpen && visibleBreedOptions[activeBreedIndex]
                        ? `breed-option-${activeBreedIndex}`
                        : undefined
                    }
                    onFocus={() => {
                      if (options.length) setBreedPickerOpen(true);
                    }}
                    onChange={(event) => {
                      setDraft({ ...draft, breed: event.target.value });
                      setHighlightedBreedIndex(0);
                      if (options.length) setBreedPickerOpen(true);
                    }}
                    onKeyDown={handleBreedKeyDown}
                    placeholder={
                      draft.species === "other"
                        ? "직접 입력"
                        : "선택하거나 직접 입력"
                    }
                  />
                  {options.length > 0 && (
                    <button
                      type="button"
                      className="breed-toggle"
                      aria-label={
                        breedPickerOpen ? "품종 목록 닫기" : "품종 목록 열기"
                      }
                      aria-expanded={breedPickerOpen}
                      onClick={() => setBreedPickerOpen((open) => !open)}
                    />
                  )}
                </div>
                {breedPickerOpen && options.length > 0 && (
                  <div
                    className="breed-options"
                    id="breed-options"
                    role="listbox"
                  >
                    {visibleBreedOptions.length ? (
                      visibleBreedOptions.map((breed, index) => (
                        <button
                          type="button"
                          id={`breed-option-${index}`}
                          key={breed}
                          role="option"
                          aria-selected={selectedBreed === breed}
                          className={`breed-option ${
                            index === activeBreedIndex ? "active" : ""
                          } ${selectedBreed === breed ? "selected" : ""}`}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setHighlightedBreedIndex(index)}
                          onClick={() => chooseBreed(breed)}
                        >
                          <span>{breed}</span>
                          {selectedBreed === breed && (
                            <Icon name="check" size={14} />
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="breed-empty">
                        목록에 없으면 그대로 입력해도 돼요.
                      </div>
                    )}
                    {selectedBreed &&
                      !options.some((breed) => breed === selectedBreed) && (
                        <div className="breed-direct">
                          <strong>{selectedBreed}</strong>
                          <span>직접 입력값으로 저장돼요.</span>
                        </div>
                      )}
                  </div>
                )}
              </div>
              <small className="field-help">
                목록에서 고르거나 직접 입력할 수 있어요.
              </small>
            </div>
            <div className="field">
              <label htmlFor="birthDate">생일</label>
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
              <label htmlFor="sex">성별</label>
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
              <label htmlFor="profileWeight">최근 체중</label>
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
          <div className="vaccination-inline">
            <div className="vaccination-inline-head">
              <div>
                <strong>예방접종</strong>
                <span>접종 기록과 다음 병원 예정일을 함께 남겨요.</span>
              </div>
              <span className="vaccination-inline-badge">
                {vaccinationDraft.dueAt ? "일정 있음" : "선택"}
              </span>
            </div>
            <div className="form-grid vaccination-grid">
              <div className="field">
                <label htmlFor="vaccineName">접종명</label>
                <input
                  id="vaccineName"
                  value={vaccinationDraft.name}
                  maxLength={80}
                  onChange={(event) =>
                    setVaccinationDraft({
                      ...vaccinationDraft,
                      name: event.target.value,
                    })
                  }
                  placeholder="예: 종합백신, 광견병"
                />
              </div>
              <div className="field">
                <label htmlFor="vaccineDoneAt">맞은 날</label>
                <input
                  id="vaccineDoneAt"
                  type="date"
                  value={vaccinationDraft.administeredAt}
                  onChange={(event) =>
                    setVaccinationDraft({
                      ...vaccinationDraft,
                      administeredAt: event.target.value,
                    })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="vaccineDueAt">다음 예정일</label>
                <input
                  id="vaccineDueAt"
                  type="date"
                  value={vaccinationDraft.dueAt}
                  onChange={(event) =>
                    setVaccinationDraft({
                      ...vaccinationDraft,
                      dueAt: event.target.value,
                    })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="vaccineNote">메모</label>
                <input
                  id="vaccineNote"
                  value={vaccinationDraft.note}
                  maxLength={120}
                  onChange={(event) =>
                    setVaccinationDraft({
                      ...vaccinationDraft,
                      note: event.target.value,
                    })
                  }
                  placeholder="병원명이나 특이사항"
                />
              </div>
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
  profile,
  recordDateKey,
  setInput,
  isEditing,
  existingMedia,
  mediaFiles,
  setMediaFiles,
  mediaEnabled,
  mediaError,
  setMediaError,
  onBack,
  onEditProfile,
  onSubmit,
  loading,
  error,
}: {
  input: HealthCheckInput;
  profile: PetProfile;
  recordDateKey: string;
  setInput: (value: HealthCheckInput) => void;
  isEditing: boolean;
  existingMedia: ReportMediaAttachment[];
  mediaFiles: PendingMediaFile[];
  setMediaFiles: (files: PendingMediaFile[]) => void;
  mediaEnabled: boolean;
  mediaError: string;
  setMediaError: (message: string) => void;
  onBack: () => void;
  onEditProfile: () => void;
  onSubmit: (overrideInput?: HealthCheckInput) => void;
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
  const totalMediaCount = existingMedia.length + mediaFiles.length;
  const hasContent = !allNormal || totalMediaCount > 0;
  const recordDateTitle =
    recordDateKey === toRecordDateKey(new Date())
      ? "오늘 기록"
      : `${formatRecordDateKey(recordDateKey)} 기록`;
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
  function addMediaFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    if (!mediaEnabled) {
      setMediaError("사진·영상 저장은 로그인 후 등록된 반려동물 기록에서 사용할 수 있어요.");
      return;
    }
    const files = Array.from(fileList);
    const nextFiles: PendingMediaFile[] = [];
    let nextError = "";
    for (const file of files) {
      if (totalMediaCount + nextFiles.length >= maxReportMediaFiles) {
        nextError = `사진·영상은 한 기록에 ${maxReportMediaFiles}개까지만 저장할 수 있어요.`;
        break;
      }
      const kind = reportMediaKindFromMimeType(file.type);
      if (!kind) {
        nextError = "JPG, PNG, WEBP, HEIC 이미지 또는 MP4, MOV, WEBM 영상만 저장할 수 있어요.";
        continue;
      }
      if (file.size > maxReportMediaSizeBytes) {
        nextError = "파일 하나는 50MB 이하로 올려 주세요.";
        continue;
      }
      nextFiles.push({
        id: crypto.randomUUID(),
        file,
        kind,
        previewUrl: URL.createObjectURL(file),
      });
    }
    setMediaError(nextError);
    if (nextFiles.length) setMediaFiles([...mediaFiles, ...nextFiles]);
  }
  function removeMediaFile(id: string) {
    const target = mediaFiles.find((item) => item.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    setMediaFiles(mediaFiles.filter((item) => item.id !== id));
    setMediaError("");
  }
  return (
    <div className="content-wrap">
      <div className="page-heading">
        <button className="back-button" onClick={onBack} aria-label="뒤로">
          <Icon name="arrow" size={20} />
        </button>
        <div>
          <h1>{isEditing ? "기록 수정" : recordDateTitle}</h1>
        </div>
      </div>
      <div className="form-panel">
        <button className="check-profile-summary" onClick={onEditProfile}>
          <PetProfileAvatar
            iconSize={17}
            pet={{ name: input.petName, photoUrl: profile.photoUrl }}
          />
          <span>
            <strong>{input.petName}</strong>
            <small>{profileDetails || "기본 정보"}</small>
          </span>
          <em>정보 수정</em>
        </button>
        <section className="record-composer" aria-label="건강 기록 작성">
          <label className="composer-prompt" htmlFor="record-note">
            오늘 {input.petName || "반려동물"}는 어땠나요?
          </label>
          <textarea
            id="record-note"
            className="composer-note"
            maxLength={1000}
            value={input.note}
            onChange={(event) => setInput({ ...input, note: event.target.value })}
            placeholder="한 줄, 사진 한 장만 남겨도 충분해요."
          />

          <div className="composer-media">
            <div className="composer-media-actions">
              <label className={`composer-media-button ${mediaEnabled && totalMediaCount < maxReportMediaFiles ? "" : "disabled"}`}>
                <Icon name="camera" size={17} /> 카메라
                <input
                  type="file"
                  accept="image/*,video/*"
                  capture="environment"
                  disabled={!mediaEnabled || totalMediaCount >= maxReportMediaFiles}
                  onChange={(event) => {
                    addMediaFiles(event.currentTarget.files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <label className={`composer-media-button ${mediaEnabled && totalMediaCount < maxReportMediaFiles ? "" : "disabled"}`}>
                <Icon name="image" size={17} /> 사진·영상
                <input
                  type="file"
                  accept={reportMediaAccept}
                  multiple
                  disabled={!mediaEnabled || totalMediaCount >= maxReportMediaFiles}
                  onChange={(event) => {
                    addMediaFiles(event.currentTarget.files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <span>{totalMediaCount}/{maxReportMediaFiles}</span>
            </div>
            {!mediaEnabled && <p className="media-helper">로그인 후 사진·영상을 함께 저장할 수 있어요.</p>}
            {isEditing && mediaEnabled && <p className="media-helper">기존 첨부는 유지되고 새 파일만 추가돼요.</p>}
            {(existingMedia.length > 0 || mediaFiles.length > 0) && (
              <div className="media-preview-grid composer-preview-grid">
                {existingMedia.map((item) => (
                  <a
                    className="media-preview-card existing"
                    href={item.signedUrl}
                    key={item.id}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <div className="media-preview-thumb">
                      <MediaThumbnail
                        kind={item.kind}
                        label={`${item.fileName} 미리보기`}
                        src={item.signedUrl ?? ""}
                      />
                    </div>
                    <span>
                      <strong>{item.fileName}</strong>
                      <small>저장됨 · 눌러서 보기</small>
                    </span>
                  </a>
                ))}
                {mediaFiles.map((item) => (
                  <div className="media-preview-card" key={item.id}>
                    <div className="media-preview-thumb">
                      <MediaThumbnail
                        kind={item.kind}
                        label={`${item.file.name} 미리보기`}
                        src={item.previewUrl}
                      />
                    </div>
                    <span>
                      <strong>{item.file.name}</strong>
                      <small>{item.kind === "image" ? "사진" : "영상"} · {formatFileSize(item.file.size)}</small>
                    </span>
                    <button type="button" onClick={() => removeMediaFile(item.id)}>삭제</button>
                  </div>
                ))}
              </div>
            )}
            {mediaError && <p className="media-error" role="alert">{mediaError}</p>}
          </div>

          <div className="composer-observations">
            <div className="composer-section-heading">
              <strong>빠른 선택</strong>
              <span>해당되는 변화만 눌러주세요</span>
            </div>
            <div className="observation-chip-list">
              {dailyObservationOptions.map((item) => {
                const selected = hasDailyObservation(input, item.id);
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`observation-chip ${selected ? "selected" : ""}`}
                    onClick={() => setInput(toggleDailyObservation(input, item.id))}
                    aria-pressed={selected}
                  >
                    {selected && <Icon name="check" size={14} />}
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {(input.appetite !== "normal" || input.energy !== "normal") && (
            <div className="composer-levels">
              {input.appetite !== "normal" && (
                <div className="composer-detail-row">
                  <strong>식사량</strong>
                  <div className="compact-choice-list" role="group" aria-label="식사량 변화">
                    {levels.filter((item) => item.id !== "normal").map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={input.appetite === item.id ? "selected" : ""}
                        onClick={() => setInput({ ...input, appetite: item.id })}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {input.energy !== "normal" && (
                <div className="composer-detail-row">
                  <strong>활력</strong>
                  <div className="compact-choice-list" role="group" aria-label="활력 변화">
                    {levels.filter((item) => item.id !== "normal").map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={input.energy === item.id ? "selected" : ""}
                        onClick={() => setInput({ ...input, energy: item.id })}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="composer-duration">
            <strong>언제부터</strong>
            <div className="compact-choice-list" role="group" aria-label="지속 기간 선택">
              {[
                { id: "today", label: "오늘" },
                { id: "2-3days", label: "2~3일" },
                { id: "4-7days", label: "4~7일" },
                { id: "over-week", label: "1주 이상" },
              ].map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={input.duration === item.id ? "selected" : ""}
                  onClick={() => setInput({ ...input, duration: item.id as HealthCheckInput["duration"] })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {input.redFlags.length > 0 && (
            <p className="legacy-safety-note">기존 기록의 위험 신호 {input.redFlags.length}개가 유지됩니다.</p>
          )}
          <p className="composer-safety-note">호흡 곤란·의식 저하·경련·지속 출혈은 기록보다 병원 연락이 먼저예요.</p>
        </section>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-footer composer-footer">
          <button
            className="primary-button"
            onClick={() => onSubmit()}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="loading-dot" />{" "}
                저장 중
              </>
            ) : (
              <>
                <Icon name="check" size={17} />{" "}
                {isEditing ? "수정 저장" : hasContent ? "기록하기" : "평소처럼 기록"}
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
  mediaWarning,
  canUseAiReport,
  aiAccess,
  onHome,
  onRestart,
  onEdit,
  onDelete,
  onFeedback,
  onCreateVetDraft,
}: {
  record: HistoryRecord;
  mediaWarning: string;
  canUseAiReport: boolean;
  aiAccess: AiAccessStatus | null;
  onHome: () => void;
  onRestart: () => void;
  onEdit: (record: HistoryRecord) => void;
  onDelete: (record: HistoryRecord) => void;
  onFeedback: (value: HistoryRecord["feedback"]) => void;
  onCreateVetDraft: (
    episodeId: string,
    reportIds?: string[],
  ) => Promise<{ draft?: VetReviewDraft; error?: string }>;
}) {
  const { result } = record;
  const checkScore = displayCheckScore(result.riskScore);
  const media = record.media ?? [];
  const mediaSummary = formatReportMediaSummary(media);
  const recordLabel = recordDateLabel(result.createdAt);
  const todayRecord = isToday(result.createdAt);
  const [copied, setCopied] = useState(false);
  const [shareState, setShareState] = useState<
    "idle" | "shared" | "copied" | "failed"
  >("idle");
  const [vetDraft, setVetDraft] = useState<VetReviewDraft | null>(null);
  const [vetDraftState, setVetDraftState] = useState<
    "idle" | "loading" | "ready" | "copied" | "failed"
  >("idle");
  const [vetDraftError, setVetDraftError] = useState("");

  async function copyBrief() {
    try {
      await copyText(result.vetBrief);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setShareState("failed");
    }
  }
  async function shareReport() {
    const title = `${record.input.petName || "반려동물"} 건강 리포트`;
    const text = [
      title,
      `${riskLabel[result.riskLevel]} · ${result.headline}`,
      result.summary,
      media.length ? `첨부 자료: ${mediaSummary} (보호자 저장, 내용 판독 전)` : "",
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
      await copyText(text);
      setShareState("copied");
    } catch {
      setShareState("failed");
    }
  }
  async function createResultVetDraft() {
    if (!record.episodeId) {
      setVetDraftError("계정에 연결된 건강 기록에서만 AI 요약을 만들 수 있어요.");
      return;
    }
    if (!canUseAiReport) {
      setVetDraftError(
        aiAccess?.reason === "monthly_limit"
          ? "이번 달 AI 요약 사용량을 모두 사용했어요."
          : "AI 요약 사용량을 확인하지 못했어요.",
      );
      return;
    }
    setVetDraftState("loading");
    setVetDraftError("");
    const payload = await onCreateVetDraft(record.episodeId);
    if (!payload.draft) {
      setVetDraftState("failed");
      setVetDraftError(payload.error ?? "AI 병원 요약을 만들지 못했어요.");
      return;
    }
    setVetDraft(payload.draft);
    setVetDraftState("ready");
  }
  async function copyResultVetDraft() {
    if (!vetDraft) return;
    try {
      await copyText(vetDraft.copyText);
      setVetDraftState("copied");
    } catch {
      setVetDraftState("failed");
      setVetDraftError("AI 요약을 복사하지 못했어요. 브라우저 권한을 확인해 주세요.");
    }
  }
  return (
    <div className="content-wrap">
      <div className="page-heading">
        <button className="back-button" onClick={onHome} aria-label="홈으로">
          <Icon name="arrow" size={20} />
        </button>
        <div>
          <p className="eyebrow">{todayRecord ? "TODAY'S RECORD" : "HEALTH RECORD"}</p>
          <h1>{record.input.petName || "반려동물"}의 {recordLabel}</h1>
          <p>{formatDate(result.createdAt)} 기준 기록이에요.</p>
        </div>
      </div>
      <div className="result-layout">
        <aside className={`risk-card ${result.riskLevel}`}>
          <div
            className="risk-ring"
            style={{ "--score": checkScore } as React.CSSProperties}
          >
            <div className="risk-score">
              <strong>{checkScore}</strong>
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
              <Icon name="activity" size={18} /> 이 기록에서 확인한 점
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
          {mediaWarning && (
            <p className="media-warning" role="alert">
              {mediaWarning}
            </p>
          )}
          {media.length > 0 && (
            <section className="result-card">
              <h3>
                <Icon name="history" size={18} /> 저장한 사진·영상
              </h3>
              <p className="media-helper">
                {mediaSummary}를 이 기록에 연결했어요. PetFlow는 사진·영상 내용을 판독하지 않아요.
              </p>
              <div className="result-media-grid">
                {media.map((item) => (
                  <div
                    className="result-media-card"
                    key={item.id}
                  >
                    <div className="result-media-thumb">
                      <MediaThumbnail
                        kind={item.kind}
                        label={item.fileName}
                        src={item.signedUrl}
                        videoControls
                      />
                    </div>
                    <span>
                      <strong>{item.fileName}</strong>
                      <small>
                        {item.kind === "image" ? "사진" : "영상"} ·{" "}
                        {formatFileSize(item.sizeBytes)}
                      </small>
                      {item.signedUrl && (
                        <a href={item.signedUrl} target="_blank" rel="noreferrer">
                          원본 열기
                        </a>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
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
          <section className="result-card vet-draft-card result-vet-draft-card">
            <div className="episode-plan-head">
              <div>
                <span className="episode-plan-step">AI DRAFT · VET REVIEW</span>
                <h3>
                  <Icon name="spark" size={18} /> AI 병원 요약
                </h3>
                <p>
                  이 기록이 연결된 같은 Episode의 관찰, 병원 안내, 경과를 수의사가 보기
                  좋은 형태로 짧게 정리해요.
                </p>
              </div>
              <span className="vet-draft-badge">
                {canUseAiReport
                  ? `${aiAccess?.remainingThisMonth ?? 0}회 남음`
                  : aiAccess?.reason === "monthly_limit"
                    ? "이번 달 완료"
                    : "확인 필요"}
              </span>
            </div>
            {!record.episodeId ? (
              <p className="plan-empty">
                서버에 저장되고 같은 건강 흐름에 연결된 기록에서 만들 수 있어요.
              </p>
            ) : !canUseAiReport ? (
              <div className="vet-draft-locked">
                <strong>
                  {aiAccess?.reason === "monthly_limit"
                    ? "이번 달 AI 요약 사용량을 모두 사용했어요."
                    : "AI 요약 사용량을 확인하지 못했어요."}
                </strong>
                <p>
                  {aiAccess?.reason === "monthly_limit"
                    ? "다음 달에 자동으로 다시 이용할 수 있어요."
                    : "잠시 후 다시 시도해 주세요."}
                </p>
              </div>
            ) : (
              <>
                <div className="vet-draft-actions">
                  <button
                    type="button"
                    className="primary-button compact"
                    onClick={createResultVetDraft}
                    disabled={vetDraftState === "loading"}
                  >
                    <Icon name={vetDraft ? "check" : "spark"} size={14} />
                    {vetDraftState === "loading"
                      ? "초안 만드는 중..."
                      : vetDraft
                      ? "AI 요약 다시 만들기"
                      : "AI 요약 만들기"}
                  </button>
                  {vetDraft && (
                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={copyResultVetDraft}
                    >
                      <Icon name={vetDraftState === "copied" ? "check" : "copy"} size={14} />
                      {vetDraftState === "copied" ? "요약 복사 완료" : "요약 전체 복사"}
                    </button>
                  )}
                </div>
                {vetDraft && (
                  <div className="vet-draft-preview">
                    <div>
                      <span>{vetDraft.source === "openai" ? "AI 정리 · 확인 전" : "규칙 기반 정리"}</span>
                      <strong>{vetDraft.overview}</strong>
                    </div>
                    <div className="vet-draft-handoff">
                      <span>다른 병원 첫 설명</span>
                      <p>{vetDraft.handoffNote}</p>
                    </div>
                    <ul>
                      {vetDraft.keyObservations.slice(0, 3).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <div className="vet-draft-questions">
                      <span>수의사에게 확인할 질문</span>
                      {vetDraft.questionsForVet.slice(0, 2).map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {vetDraftError && (
              <p className="share-error" role="alert">{vetDraftError}</p>
            )}
            <p className="plan-safety-note">
              AI 요약은 보호자 기록 정리용입니다. 진단·처방·약물명·용량·치료 계획을
              만들지 않으며 수의사 확인 전 자료로 표시됩니다.
            </p>
          </section>
          <div className="disclaimer">
            <strong>꼭 확인해 주세요.</strong> {result.disclaimer}
          </div>
          <section className="result-card">
            <div className="feedback-row">
              <p>이 기록 정리가 도움이 됐나요?</p>
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
            <button className="secondary-button" onClick={() => onEdit(record)}>
              수정
            </button>
            <button
              className="secondary-button compact danger-button"
              onClick={() => onDelete(record)}
            >
              삭제
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
  onBack,
  onSelect,
  onEdit,
  onDelete,
  onStart,
  onCloseEpisode,
  onOpenReport,
  closingEpisodeId,
  episodeError,
}: {
  history: HistoryRecord[];
  flow: HealthFlowSummary;
  episodes: PetEpisode[];
  onBack: () => void;
  onSelect: (record: HistoryRecord) => void;
  onEdit: (record: HistoryRecord) => void;
  onDelete: (record: HistoryRecord) => void;
  onStart: (dateKey: string) => void;
  onCloseEpisode: (episodeId: string) => void;
  onOpenReport: (records: HistoryRecord[], episode?: PetEpisode) => void;
  closingEpisodeId?: string;
  episodeError: string;
}) {
  const latestDateKey = toRecordDateKey(history[0]?.result.createdAt ?? new Date());
  const [calendarMonth, setCalendarMonth] = useState(() =>
    monthKeyFromDate(history[0]?.result.createdAt ?? new Date()),
  );
  const [selectionStart, setSelectionStart] = useState(latestDateKey);
  const [selectionEnd, setSelectionEnd] = useState<string | null>(latestDateKey);
  const [rangeMode, setRangeMode] = useState(false);
  const todayKey = toRecordDateKey(new Date());
  const recordsByDate = useMemo(() => {
    const grouped = new Map<string, HistoryRecord[]>();
    for (const record of history) {
      const key = toRecordDateKey(record.result.createdAt);
      if (!key) continue;
      grouped.set(key, [...(grouped.get(key) ?? []), record]);
    }
    return grouped;
  }, [history]);
  const calendarDays = useMemo(
    () => buildRecordCalendar(calendarMonth),
    [calendarMonth],
  );
  const selectionReady = !rangeMode || Boolean(selectionEnd);
  const selectedRecords = useMemo(
    () =>
      selectionReady
        ? history.filter((record) =>
            isRecordDateInRange(
              toRecordDateKey(record.result.createdAt),
              selectionStart,
              selectionEnd,
            ),
          )
        : [],
    [history, selectionEnd, selectionReady, selectionStart],
  );
  const selectedEpisode = useMemo(() => {
    const episodeId = selectedRecords[0]?.episodeId;
    if (!episodeId || selectedRecords.some((record) => record.episodeId !== episodeId)) {
      return undefined;
    }
    return episodes.find((episode) => episode.id === episodeId);
  }, [episodes, selectedRecords]);
  const selectedRisk = highestRecordRisk(selectedRecords);

  function selectCalendarDay(dateKey: string) {
    setCalendarMonth(dateKey.slice(0, 7));
    if (!rangeMode) {
      setSelectionStart(dateKey);
      setSelectionEnd(dateKey);
      return;
    }
    if (!selectionStart || selectionEnd) {
      setSelectionStart(dateKey);
      setSelectionEnd(null);
      return;
    }
    const range = normalizeRecordDateRange(selectionStart, dateKey);
    setSelectionStart(range.start);
    setSelectionEnd(range.end);
  }

  function toggleRangeMode() {
    setRangeMode((current) => {
      if (current) {
        setSelectionEnd(selectionStart);
        return false;
      }
      setSelectionEnd(null);
      return true;
    });
  }

  return (
    <div className="content-wrap compact-flow-page">
      <div className="page-heading">
        <button className="back-button" onClick={onBack} aria-label="홈으로">
          <Icon name="arrow" size={20} />
        </button>
        <div>
          <h1>기록 달력</h1>
          <p>
            {history.length
              ? `최근 14일 ${flow.recordCount}회 · ${flow.headline}`
              : "날짜를 확인하고 오늘 기록을 시작해요."}
          </p>
        </div>
      </div>
      <div className="record-calendar-layout">
      <section className="record-calendar-card">
        <div className="record-calendar-header">
          <button
            type="button"
            onClick={() => setCalendarMonth((current) => shiftRecordMonth(current, -1))}
            aria-label="이전 달"
          >
            <Icon name="arrow" size={16} />
          </button>
          <strong>{formatRecordMonth(calendarMonth)}</strong>
          <button
            type="button"
            onClick={() => setCalendarMonth((current) => shiftRecordMonth(current, 1))}
            aria-label="다음 달"
            className="record-calendar-next"
          >
            <Icon name="arrow" size={16} />
          </button>
        </div>
        <div className="record-calendar-weekdays" aria-hidden="true">
          {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="record-calendar-grid">
          {calendarDays.map((day) => {
            const dayRecords = recordsByDate.get(day.dateKey) ?? [];
            const dayRisk = highestRecordRisk(dayRecords);
            const selected = isRecordDateInRange(
              day.dateKey,
              selectionStart,
              selectionEnd,
            );
            const isEdge =
              day.dateKey === selectionStart || day.dateKey === selectionEnd;
            return (
              <button
                type="button"
                key={day.dateKey}
                className={[
                  "record-calendar-day",
                  day.inCurrentMonth ? "" : "outside",
                  selected ? "selected" : "",
                  isEdge ? "edge" : "",
                  day.dateKey === todayKey ? "today" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => selectCalendarDay(day.dateKey)}
                aria-pressed={selected}
                aria-label={`${formatRecordDateKey(day.dateKey)}${dayRecords.length ? `, 기록 ${dayRecords.length}개` : ""}`}
              >
                <span>{day.day}</span>
                {dayRecords.length > 0 && (
                  <small className={`record-calendar-mark ${dayRisk ?? "watch"}`}>
                    {dayRecords.length > 1 ? dayRecords.length : ""}
                  </small>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="record-calendar-selection">
        <div className="record-calendar-selection-head">
          <div>
            <span>{rangeMode ? "기간 선택" : "선택한 날짜"}</span>
            <h2>{formatRecordRange(selectionStart, selectionEnd)}</h2>
            <p>
              {rangeMode && !selectionEnd
                ? "종료일을 눌러 주세요."
                : `${selectedRecords.length}개 기록${selectedRisk ? ` · ${riskLabel[selectedRisk]}` : ""}`}
            </p>
          </div>
          <button
            type="button"
            className="secondary-button compact"
            onClick={toggleRangeMode}
          >
            {rangeMode ? "날짜 보기" : "기간 선택"}
          </button>
        </div>

        {!rangeMode && selectedRecords.length > 0 && (
          <div className="history-grid record-calendar-history">
            {selectedRecords.map((record) => (
              <article key={record.result.id} className="history-card">
                <button className="history-card-main" onClick={() => onSelect(record)}>
                  <span className="history-date">
                    {Number(toRecordDateKey(record.result.createdAt).slice(-2))}일
                  </span>
                  <span>
                    <h3>{record.result.headline}</h3>
                    <p>
                      {formatDate(record.result.createdAt)} · 증상 {record.input.symptoms.length}개
                    </p>
                  </span>
                  <span className={`history-risk ${record.result.riskLevel}`}>
                    {riskLabel[record.result.riskLevel]}
                  </span>
                </button>
                <HistoryMediaPreview media={record.media} />
                <div className="history-card-actions">
                  <button type="button" onClick={() => onEdit(record)}>수정</button>
                  <button type="button" className="danger" onClick={() => onDelete(record)}>
                    삭제
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {!rangeMode && selectedRecords.length === 0 && (
          <p className="record-calendar-empty">이 날짜에는 기록이 없어요.</p>
        )}

        <div
          className={`record-calendar-actions ${rangeMode ? "single-action" : ""}`}
        >
          {!rangeMode && (
            <button
              className="primary-button"
              onClick={() => onStart(selectionStart)}
              disabled={selectionStart > todayKey}
            >
              <Icon name="plus" size={16} />
              {selectionStart === todayKey ? "오늘 기록" : "기록 추가"}
            </button>
          )}
          <button
            className="secondary-button"
            onClick={() => onOpenReport(selectedRecords, selectedEpisode)}
            disabled={!selectionReady || selectedRecords.length === 0}
          >
            <Icon name="spark" size={15} />
            {selectedEpisode ? "요약 · AI 요약" : "선택 요약"}
          </button>
          {selectedEpisode?.status === "open" && (
            <button
              className="secondary-button"
              onClick={() => onCloseEpisode(selectedEpisode.id)}
              disabled={closingEpisodeId === selectedEpisode.id}
            >
              <Icon name="check" size={15} />
              {closingEpisodeId === selectedEpisode.id ? "마무리 중..." : "흐름 마무리"}
            </button>
          )}
        </div>
        {episodeError && <p className="share-error" role="alert">{episodeError}</p>}
      </section>
      </div>
    </div>
  );
}

function EpisodeReportView({
  selection,
  petName,
  plan,
  progress,
  onBack,
  onSelectRecord,
  onSavePlan,
  onTogglePlanTask,
  onSaveProgress,
  onCreateVetDraft,
  canUseAiReport,
  aiAccess,
  onSaveAiFeedback,
}: {
  selection: EpisodeReportSelection;
  petName: string;
  plan?: EpisodePlan;
  progress: EpisodeProgress[];
  onBack: () => void;
  onSelectRecord: (record: HistoryRecord) => void;
  onSavePlan: (episodeId: string, tasks: string[]) => Promise<string>;
  onTogglePlanTask: (
    episodeId: string,
    taskId: string,
    completed: boolean,
  ) => Promise<string>;
  onSaveProgress: (
    episodeId: string,
    input: Pick<
      EpisodeProgress,
      "followUpDay" | "conditionChange" | "appetite" | "energy"
    >,
  ) => Promise<string>;
  onCreateVetDraft: (
    episodeId: string,
    reportIds?: string[],
  ) => Promise<{ draft?: VetReviewDraft; error?: string }>;
  canUseAiReport: boolean;
  aiAccess: AiAccessStatus | null;
  onSaveAiFeedback: (input: AiReportFeedbackInput) => Promise<string>;
}) {
  const report = useMemo(
    () => buildEpisodeReport(selection.records, petName, plan, progress),
    [petName, plan, progress, selection.records],
  );
  const completedPlanTaskCount = plan?.tasks.filter((task) => task.completedAt).length ?? 0;
  const totalPlanTaskCount = plan?.tasks.length ?? 0;
  const initialProgressCount = progress.filter((item) =>
    [3, 7, 14].includes(item.followUpDay),
  ).length;
  const longTermProgressCount = progress.filter((item) =>
    [30, 60, 90].includes(item.followUpDay),
  ).length;
  const [shareState, setShareState] = useState<
    "idle" | "shared" | "copied" | "failed"
  >("idle");
  const [planDraft, setPlanDraft] = useState<string[]>(
    plan?.tasks.map((task) => task.text) ?? [""],
  );
  const [editingPlan, setEditingPlan] = useState(!plan);
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState("");
  const [progressDraft, setProgressDraft] = useState<{
    followUpDay: FollowUpDay;
    conditionChange: ConditionChange;
    appetite: Level;
    energy: Level;
  } | null>(null);
  const [progressBusy, setProgressBusy] = useState(false);
  const [progressError, setProgressError] = useState("");
  const [vetDraft, setVetDraft] = useState<VetReviewDraft | null>(null);
  const [vetDraftState, setVetDraftState] = useState<
    "idle" | "loading" | "ready" | "copied" | "failed"
  >("idle");
  const [vetDraftError, setVetDraftError] = useState("");
  const [feedbackScore, setFeedbackScore] =
    useState<AiReportFeedbackInput["usefulnessScore"]>(5);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackState, setFeedbackState] = useState<
    "idle" | "saving" | "saved" | "failed"
  >("idle");
  const [feedbackError, setFeedbackError] = useState("");

  async function copyReport() {
    try {
      await copyText(report.shareText);
      setShareState("copied");
    } catch {
      setShareState("failed");
    }
  }

  async function shareReport() {
    setShareState("idle");
    if (navigator.share) {
      try {
        await navigator.share({ title: report.title, text: report.shareText });
        setShareState("shared");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copyReport();
  }

  async function savePlan() {
    if (!selection.episode) return;
    const tasks = planDraft.map((task) => task.trim()).filter(Boolean);
    if (!tasks.length) {
      setPlanError("병원에서 받은 계획을 한 가지 이상 적어 주세요.");
      return;
    }
    setPlanBusy(true);
    setPlanError("");
    const message = await onSavePlan(selection.episode.id, tasks);
    setPlanBusy(false);
    if (message) {
      setPlanError(message);
      return;
    }
    setEditingPlan(false);
  }

  async function togglePlanTask(taskId: string, completed: boolean) {
    if (!selection.episode) return;
    setPlanBusy(true);
    setPlanError("");
    const message = await onTogglePlanTask(
      selection.episode.id,
      taskId,
      completed,
    );
    setPlanBusy(false);
    if (message) setPlanError(message);
  }

  function openProgressEditor(day: FollowUpDay) {
    const existing = progress.find((item) => item.followUpDay === day);
    setProgressDraft({
      followUpDay: day,
      conditionChange: existing?.conditionChange ?? "same",
      appetite: existing?.appetite ?? "normal",
      energy: existing?.energy ?? "normal",
    });
    setProgressError("");
  }

  async function saveProgress() {
    if (!selection.episode || !progressDraft) return;
    setProgressBusy(true);
    setProgressError("");
    const message = await onSaveProgress(selection.episode.id, progressDraft);
    setProgressBusy(false);
    if (message) {
      setProgressError(message);
      return;
    }
    setProgressDraft(null);
  }

  async function createVetDraft() {
    if (!selection.episode) {
      setVetDraftError("계정에 연결된 Episode 기록에서만 초안을 만들 수 있어요.");
      return;
    }
    if (!canUseAiReport) {
      setVetDraftError(
        aiAccess?.reason === "monthly_limit"
          ? "이번 달 AI 요약 사용량을 모두 사용했어요."
          : "AI 요약 사용량을 확인하지 못했어요.",
      );
      return;
    }
    setVetDraftState("loading");
    setVetDraftError("");
    const result = await onCreateVetDraft(
      selection.episode.id,
      selection.records.map((record) => record.result.id),
    );
    if (!result.draft) {
      setVetDraftState("failed");
      setVetDraftError(result.error ?? "AI 병원 요약을 만들지 못했어요.");
      return;
    }
    setVetDraft(result.draft);
    setVetDraftState("ready");
  }

  async function copyVetDraft() {
    if (!vetDraft) return;
    try {
      await copyText(vetDraft.copyText);
      setVetDraftState("copied");
    } catch {
      setVetDraftState("failed");
      setVetDraftError("AI 요약을 복사하지 못했어요. 브라우저 권한을 확인해 주세요.");
    }
  }

  async function saveAiFeedback() {
    if (!vetDraft?.usageId) return;
    setFeedbackState("saving");
    setFeedbackError("");
    const message = await onSaveAiFeedback({
      usageId: vetDraft.usageId,
      episodeId: selection.episode?.id,
      usefulnessScore: feedbackScore,
      comment: feedbackComment.trim() || undefined,
    });
    if (message) {
      setFeedbackState("failed");
      setFeedbackError(message);
      return;
    }
    setFeedbackState("saved");
  }

  return (
    <div className="content-wrap">
      <div className="page-heading">
        <button className="back-button" onClick={onBack} aria-label="건강 흐름으로">
          <Icon name="arrow" size={20} />
        </button>
        <div>
          <p className="eyebrow">VET SHARE</p>
          <h1>병원 전달 요약</h1>
          <p>이 기록 묶음만 간결하게 정리했어요.</p>
        </div>
      </div>

      <section className="episode-report-hero">
        <div>
          <span className={`episode-status ${selection.episode?.status === "open" ? "open" : "closed"}`}>
            {selection.episode?.status === "open"
              ? "진행 중인 기록"
              : selection.episode
                ? "마무리된 기록"
                : "개별 기록"}
          </span>
          <h2>{report.title}</h2>
          <p>
            {report.periodLabel} · 보호자 관찰 {report.recordCount}회
            {report.mediaCount ? ` · 첨부 ${report.mediaCount}개` : ""}
          </p>
        </div>
        <div className="episode-report-actions">
          <button className="primary-button" onClick={shareReport}>
            <Icon
              name={shareState === "shared" || shareState === "copied" ? "check" : "share"}
              size={16}
            />
            {shareState === "shared"
              ? "공유했어요"
              : shareState === "copied"
                ? "공유용 복사 완료"
                : "기기에서 공유"}
          </button>
          <button className="secondary-button" onClick={copyReport}>
            <Icon name={shareState === "copied" ? "check" : "copy"} size={15} />
            {shareState === "copied" ? "전체 복사 완료" : "전체 내용 복사"}
          </button>
        </div>
      </section>

      {shareState === "failed" && (
        <p className="share-error" role="alert">
          공유하거나 복사하지 못했어요. 브라우저 권한을 확인해 주세요.
        </p>
      )}

      <section className="result-card vet-draft-card">
        <div className="episode-plan-head">
          <div>
            <span className="episode-plan-step">AI DRAFT · VET REVIEW</span>
            <h3>
              <Icon name="spark" size={18} /> AI 병원 요약
            </h3>
            <p>
              기록해 둔 관찰, 병원 계획, 초기·장기 경과를 자동으로 묶어 다른 병원에도 바로 전달해요.
            </p>
          </div>
          <span className="vet-draft-badge">AI 작성 · 확인 전</span>
        </div>

        <div className="vet-draft-includes" aria-label="AI 요약 자동 포함 자료">
          <span>자동 포함</span>
          <strong>관찰 {report.recordCount}회</strong>
          <strong>계획 {completedPlanTaskCount}/{totalPlanTaskCount}개</strong>
          <strong>초기 경과 {initialProgressCount}/3</strong>
          <strong>장기 경과 {longTermProgressCount}/3</strong>
          <strong>첨부 {report.mediaCount}개</strong>
          <strong>다른 병원 첫 설명</strong>
        </div>

        {!selection.episode ? (
          <p className="plan-empty">
            계정에 연결된 Episode 기록부터 남기면 AI 초안을 만들 수 있어요.
          </p>
        ) : !canUseAiReport ? (
          <div className="vet-draft-locked">
            <strong>
              {aiAccess?.reason === "monthly_limit"
                ? "이번 달 AI 요약 사용량을 모두 사용했어요."
                : "AI 요약 사용량을 확인하지 못했어요."}
            </strong>
            <p>
              {aiAccess?.reason === "monthly_limit"
                ? "다음 달에 자동으로 다시 이용할 수 있어요."
                : "잠시 후 다시 시도해 주세요."}
            </p>
          </div>
        ) : (
          <>
            <div className="vet-draft-actions">
              <button
                type="button"
                className="primary-button compact"
                onClick={createVetDraft}
                disabled={vetDraftState === "loading"}
              >
                <Icon name={vetDraft ? "check" : "spark"} size={14} />
                {vetDraftState === "loading"
                  ? "초안 만드는 중..."
                  : vetDraft
                    ? "AI 요약 다시 만들기"
                    : "AI 요약 만들기"}
              </button>
              {vetDraft && (
                <button
                  type="button"
                  className="secondary-button compact"
                  onClick={copyVetDraft}
                >
                  <Icon name={vetDraftState === "copied" ? "check" : "copy"} size={14} />
                  {vetDraftState === "copied" ? "초안 복사 완료" : "초안 전체 복사"}
                </button>
              )}
            </div>

            {vetDraft && (
              <div className="vet-draft-preview">
                <div>
                  <span>{vetDraft.source === "openai" ? "AI 정리" : "규칙 기반 정리"}</span>
                  <strong>{vetDraft.overview}</strong>
                </div>
                <div className="vet-draft-handoff">
                  <span>다른 병원 첫 설명</span>
                  <p>{vetDraft.handoffNote}</p>
                </div>
                <ul>
                  {vetDraft.keyObservations.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="vet-draft-handoff">
                  <span>첨부 자료</span>
                  <p>{vetDraft.mediaSummary.slice(0, 2).join(" · ")}</p>
                </div>
                <div className="vet-draft-questions">
                  <span>확인 질문</span>
                  {vetDraft.questionsForVet.slice(0, 2).map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
                {vetDraft.usageId && (
                  <div className="ai-feedback-box">
                    <span>사용자 피드백</span>
                    <div className="ai-feedback-grid">
                      <label>
                        수의사 검토에 유용했나요?
                        <select
                          value={feedbackScore}
                          onChange={(event) =>
                            setFeedbackScore(
                              Number(event.target.value) as AiReportFeedbackInput["usefulnessScore"],
                            )
                          }
                        >
                          <option value={5}>5점 · 매우 유용</option>
                          <option value={4}>4점 · 유용</option>
                          <option value={3}>3점 · 보통</option>
                          <option value={2}>2점 · 부족</option>
                          <option value={1}>1점 · 거의 도움 안 됨</option>
                        </select>
                      </label>
                      <label>
                        짧은 의견 (선택)
                        <input
                          value={feedbackComment}
                          onChange={(event) => setFeedbackComment(event.target.value)}
                          maxLength={500}
                          placeholder="빠진 정보나 아쉬운 점"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={saveAiFeedback}
                      disabled={feedbackState === "saving"}
                    >
                      {feedbackState === "saved"
                        ? "피드백 저장 완료"
                        : feedbackState === "saving"
                          ? "저장 중..."
                          : "피드백 저장"}
                    </button>
                    {feedbackError && (
                      <p className="share-error" role="alert">{feedbackError}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {vetDraftError && (
          <p className="share-error" role="alert">{vetDraftError}</p>
        )}
        <p className="plan-safety-note">
          AI 요약은 보호자 기록 정리용입니다. 진단·처방·약물명·용량·치료 계획을 만들지 않으며,
          수의사 확인 전 정보로 표시합니다.
        </p>
      </section>

      <div className="episode-report-layout">
        <section className="result-card episode-report-summary">
          <h3>
            <Icon name="stethoscope" size={18} /> 병원에서 먼저 볼 내용
          </h3>
          <div className="episode-report-stats">
            <div>
              <span>프로필</span>
              <strong>{report.petProfile}</strong>
            </div>
            <div>
              <span>가장 높은 앱 안내</span>
              <strong>{report.highestRiskLabel}</strong>
            </div>
            <div>
              <span>식욕 변화</span>
              <strong>{report.appetiteChangeCount}회</strong>
            </div>
            <div>
              <span>활력 변화</span>
              <strong>{report.energyChangeCount}회</strong>
            </div>
            <div>
              <span>첨부 자료</span>
              <strong>{report.mediaCount ? `${report.mediaCount}개` : "없음"}</strong>
            </div>
          </div>
          <div className="episode-report-repeat">
            <span>반복 관찰</span>
            <div className="flow-tags">
              {report.repeatedSymptoms.length ? (
                report.repeatedSymptoms.map((item) => <span key={item}>{item}</span>)
              ) : (
                <span>뚜렷한 반복 기록 없음</span>
              )}
            </div>
          </div>
        </section>

        <section className="result-card">
          <h3>
            <Icon name="history" size={18} /> 시간순 보호자 관찰
          </h3>
          <div className="episode-report-timeline">
            {report.timeline.map((item, index) => {
              const sourceRecord = selection.records.find(
                (record) => record.result.id === item.id,
              );
              return (
                <button
                  key={item.id}
                  className="episode-report-entry"
                  onClick={() => sourceRecord && onSelectRecord(sourceRecord)}
                >
                  <span className="episode-report-index">{index + 1}</span>
                  <span>
                    <strong>{item.dateLabel}</strong>
                    <small>증상: {item.symptoms}</small>
                    <small>
                      식욕 {item.appetite} · 활력 {item.energy} · {item.duration}
                    </small>
                    {item.mediaCount > 0 && (
                      <small>
                        첨부 {formatReportMediaCount(item.imageCount, item.videoCount)}
                      </small>
                    )}
                  </span>
                  <em>{item.riskLabel}</em>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <section className="result-card episode-plan-card" id="episode-plan">
        <div className="episode-plan-head">
          <div>
            <span className="episode-plan-step">SOAP-LOOP · P</span>
            <h3>
              <Icon name="clipboard" size={18} /> 병원에서 받은 계획
            </h3>
            <p>병원에서 들은 내용을 짧은 할 일로 옮겨 적고 하나씩 체크해요.</p>
          </div>
          <span className="plan-source-badge">보호자 기록 · 수의사 확인 전</span>
        </div>

        {!selection.episode ? (
          <p className="plan-empty">
            계정에 연결된 건강 기록부터 남기면 병원 계획을 이어서 관리할 수 있어요.
          </p>
        ) : plan && !editingPlan ? (
          <>
            <div className="plan-task-list">
              {plan.tasks.map((task) => (
                <button
                  key={task.id}
                  className={`plan-task ${task.completedAt ? "completed" : ""}`}
                  onClick={() => togglePlanTask(task.id, !task.completedAt)}
                  disabled={planBusy}
                >
                  <span className="plan-check">
                    {task.completedAt && <Icon name="check" size={14} />}
                  </span>
                  <span>{task.text}</span>
                </button>
              ))}
            </div>
            <button
              className="text-button plan-edit-button"
              onClick={() => setEditingPlan(true)}
            >
              계획 항목 수정
            </button>
          </>
        ) : (
          <div className="plan-editor">
            {planDraft.map((task, index) => (
              <div className="plan-task-editor" key={index}>
                <span>{index + 1}</span>
                <input
                  value={task}
                  maxLength={160}
                  placeholder={
                    index === 0
                      ? "예: 3일 뒤 상태를 다시 확인하기"
                      : "다음 계획을 짧게 적어 주세요"
                  }
                  onChange={(event) =>
                    setPlanDraft((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? event.target.value : item,
                      ),
                    )
                  }
                />
                {planDraft.length > 1 && (
                  <button
                    type="button"
                    className="plan-remove"
                    aria-label={`${index + 1}번 계획 삭제`}
                    onClick={() =>
                      setPlanDraft((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    삭제
                  </button>
                )}
              </div>
            ))}
            <div className="plan-editor-actions">
              {planDraft.length < 5 && (
                <button
                  type="button"
                  className="secondary-button compact"
                  onClick={() => setPlanDraft((current) => [...current, ""])}
                >
                  <Icon name="plus" size={14} /> 항목 추가
                </button>
              )}
              {plan && (
                <button
                  type="button"
                  className="secondary-button compact"
                  onClick={() => {
                    setPlanDraft(plan.tasks.map((task) => task.text));
                    setEditingPlan(false);
                    setPlanError("");
                  }}
                >
                  취소
                </button>
              )}
              <button
                type="button"
                className="primary-button compact"
                onClick={savePlan}
                disabled={planBusy}
              >
                <Icon name="check" size={14} />
                {planBusy ? "저장 중..." : "계획 저장"}
              </button>
            </div>
          </div>
        )}
        {planError && <p className="share-error" role="alert">{planError}</p>}
        <p className="plan-safety-note">
          병원 안내를 받은 그대로 적어 주세요. PetFlow가 진단이나 처방을 만들거나 수정하지 않습니다.
        </p>
      </section>

      <section className="result-card episode-progress-card" id="episode-progress">
        <div className="episode-plan-head">
          <div>
            <span className="episode-plan-step">SOAP-LOOP · FOLLOW UP</span>
            <h3>
              <Icon name="activity" size={18} /> 경과 기록
            </h3>
            <p>초기 3·7·14일과 장기 30·60·90일 흐름을 같은 사건에 이어 남겨요.</p>
          </div>
          <span className="progress-source-badge">보호자 경과 · 확인 전</span>
        </div>

        {!selection.episode ? (
          <p className="plan-empty">
            계정에 연결된 건강 기록부터 남기면 경과를 이어서 관리할 수 있어요.
          </p>
        ) : (
          <div className="progress-checkpoints">
            {followUpGroups.map((group) => (
              <div className="progress-group" key={group.title}>
                <div className="progress-group-head">
                  <strong>{group.title}</strong>
                  <span>{group.description}</span>
                </div>
                {group.days.map((day) => {
                  const saved = progress.find((item) => item.followUpDay === day);
                  const isEditing = progressDraft?.followUpDay === day;
                  return (
                    <section
                      className={`progress-checkpoint ${saved ? "saved" : ""}`}
                      key={day}
                    >
                      <div className="progress-checkpoint-head">
                        <span className="progress-day">{day}일</span>
                        <div>
                          <strong>
                            {selection.episode
                              ? `${followUpDate(plan?.reportedAt ?? selection.episode.startedAt, day)} 확인`
                              : `${day}일 경과`}
                          </strong>
                          <small>
                            {saved
                              ? `${conditionChangeLabel(saved.conditionChange)} · 식욕 ${levelLabel(saved.appetite)} · 활력 ${levelLabel(saved.energy)}`
                              : "아직 경과를 기록하지 않았어요"}
                          </small>
                        </div>
                        {!isEditing && (
                          <button
                            type="button"
                            className="secondary-button compact"
                            onClick={() => openProgressEditor(day)}
                          >
                            {saved ? "수정" : "경과 기록"}
                          </button>
                        )}
                      </div>

                      {isEditing && progressDraft && (
                        <div className="progress-editor">
                          <fieldset>
                            <legend>전반적인 변화</legend>
                            <div className="progress-choice-grid">
                              {conditionChangeOptions.map((option) => (
                                <button
                                  type="button"
                                  className={
                                    progressDraft.conditionChange === option.id
                                      ? "selected"
                                      : ""
                                  }
                                  key={option.id}
                                  onClick={() =>
                                    setProgressDraft((current) =>
                                      current
                                        ? { ...current, conditionChange: option.id }
                                        : current,
                                    )
                                  }
                                >
                                  <strong>{option.label}</strong>
                                  <small>{option.description}</small>
                                </button>
                              ))}
                            </div>
                          </fieldset>

                          <div className="progress-level-grid">
                            <label>
                              식욕
                              <select
                                value={progressDraft.appetite}
                                onChange={(event) =>
                                  setProgressDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          appetite: event.target.value as Level,
                                        }
                                      : current,
                                  )
                                }
                              >
                                {levels.map((level) => (
                                  <option value={level.id} key={level.id}>
                                    {level.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              활력
                              <select
                                value={progressDraft.energy}
                                onChange={(event) =>
                                  setProgressDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          energy: event.target.value as Level,
                                        }
                                      : current,
                                  )
                                }
                              >
                                {levels.map((level) => (
                                  <option value={level.id} key={level.id}>
                                    {level.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <div className="progress-editor-actions">
                            <button
                              type="button"
                              className="secondary-button compact"
                              onClick={() => setProgressDraft(null)}
                              disabled={progressBusy}
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              className="primary-button compact"
                              onClick={saveProgress}
                              disabled={progressBusy}
                            >
                              <Icon name="check" size={14} />
                              {progressBusy ? "저장 중..." : `${day}일 경과 저장`}
                            </button>
                          </div>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        {progressError && (
          <p className="share-error" role="alert">{progressError}</p>
        )}
        <p className="plan-safety-note">
          이 내용은 보호자가 관찰해 기록한 경과이며, 수의사의 확인이나 진단을 대신하지 않습니다.
        </p>
      </section>

      <div className="disclaimer episode-report-disclaimer">
        <strong>자료의 범위</strong> {report.disclaimer}
      </div>
    </div>
  );
}

export function PetFlowApp() {
  const [view, setViewState] = useState<View>("home");
  const currentViewRef = useRef<View>("home");
  const applyingPopState = useRef(false);
  const [profile, setProfile] = useState<PetProfile>(initialProfile);
  const [editingProfile, setEditingProfile] = useState<PetProfile>(initialProfile);
  const [pets, setPets] = useState<PetProfile[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string>();
  const [user, setUser] = useState<User | null>(null);
  const [testerProfile, setTesterProfile] = useState<TesterProfile | null>(null);
  const [aiAccess, setAiAccess] = useState<AiAccessStatus | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authEntryMode, setAuthEntryMode] = useState<"login" | "signup">("login");
  const [input, setInput] = useState<HealthCheckInput>(initialInput);
  const [recordDateKey, setRecordDateKey] = useState(() =>
    toRecordDateKey(new Date()),
  );
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [episodes, setEpisodes] = useState<PetEpisode[]>([]);
  const [plans, setPlans] = useState<EpisodePlan[]>([]);
  const [progress, setProgress] = useState<EpisodeProgress[]>([]);
  const [vaccinations, setVaccinations] = useState<VaccinationRecord[]>([]);
  const vaccinationTableAvailableRef = useRef(true);
  const [pendingMedia, setPendingMedia] = useState<PendingMediaFile[]>([]);
  const pendingMediaRef = useRef<PendingMediaFile[]>([]);
  const [mediaError, setMediaError] = useState("");
  const [mediaUploadWarning, setMediaUploadWarning] = useState("");
  const [selected, setSelected] = useState<HistoryRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<HistoryRecord | null>(null);
  const [selectedEpisodeReport, setSelectedEpisodeReport] =
    useState<EpisodeReportSelection | null>(null);
  const [profileReturnView, setProfileReturnView] = useState<"home" | "check" | "account">(
    "home",
  );
  const [loading, setLoading] = useState(false);
  const [flowLoading, setFlowLoading] = useState(false);
  const [closingEpisodeId, setClosingEpisodeId] = useState<string>();
  const [episodeError, setEpisodeError] = useState("");
  const [error, setError] = useState("");
  const [appNotice, setAppNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const setView = useCallback<SetView>((nextView, options) => {
    const mode = options?.history ?? "push";
    if (currentViewRef.current === nextView) return;
    if (
      typeof window !== "undefined" &&
      !applyingPopState.current &&
      mode !== "none"
    ) {
      const state = { petflowView: nextView };
      if (mode === "replace") {
        window.history.replaceState(state, "", window.location.href);
      } else if (window.history.state?.petflowView !== nextView) {
        window.history.pushState(state, "", window.location.href);
      }
    }
    currentViewRef.current = nextView;
    setViewState(nextView);
  }, []);
  const openAuth = useCallback(
    (mode: "login" | "signup", history: "push" | "replace" = "replace") => {
      setAuthEntryMode(mode);
      setView("account", { history });
    },
    [setView],
  );
  const currentView = useMemo(
    () =>
      view === "result" && !selected
        ? "home"
        : view === "episode-report" && !selectedEpisodeReport
          ? "history"
          : view,
    [selected, selectedEpisodeReport, view],
  );
  const hasCheckDraft = useMemo(
    () =>
      currentView === "check" &&
      (Boolean(editingRecord) ||
        pendingMedia.length > 0 ||
        hasObservationDraft(input)),
    [currentView, editingRecord, input, pendingMedia.length],
  );

  useEffect(() => {
    pendingMediaRef.current = pendingMedia;
  }, [pendingMedia]);

  useEffect(() => {
    if (!hasCheckDraft) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasCheckDraft]);

  useEffect(
    () => () => {
      pendingMediaRef.current.forEach((item) =>
        URL.revokeObjectURL(item.previewUrl),
      );
    },
    [],
  );

  useEffect(() => {
    if (!appNotice) return;
    const timer = window.setTimeout(() => setAppNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [appNotice]);

  useEffect(() => {
    currentViewRef.current = "home";
    if (window.history.state?.petflowView !== "home") {
      window.history.replaceState({ petflowView: "home" }, "", window.location.href);
    }
    function handlePopState(event: PopStateEvent) {
      applyingPopState.current = true;
      const nextView = isView(event.state?.petflowView)
        ? event.state.petflowView
        : "home";
      currentViewRef.current = nextView;
      setViewState(nextView);
      window.requestAnimationFrame(() => {
        applyingPopState.current = false;
      });
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  const visibleHistory = useMemo(() => {
    if (!user) return history.filter((record) => !record.petId);
    if (!selectedPetId) return [];
    return history.filter((record) => record.petId === selectedPetId);
  }, [history, selectedPetId, user]);
  const selectedPetVaccinations = useMemo(
    () =>
      selectedPetId
        ? vaccinations.filter((record) => record.petId === selectedPetId)
        : [],
    [selectedPetId, vaccinations],
  );
  const editingProfileVaccinations = useMemo(
    () =>
      editingProfile.id
        ? vaccinations.filter((record) => record.petId === editingProfile.id)
        : [],
    [editingProfile.id, vaccinations],
  );
  const editingProfileVaccinationKey = editingProfileVaccinations
    .map((record) => `${record.id}:${record.updatedAt}`)
    .join("|");
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
  const activeEpisodeProgressCount = useMemo(
    () =>
      activeEpisode
        ? progress.filter(
            (item) =>
              item.episodeId === activeEpisode.id &&
              [3, 7, 14].includes(item.followUpDay),
          ).length
        : 0,
    [activeEpisode, progress],
  );
  const selectedReportIsWholeEpisode = useMemo(() => {
    const episodeId = selectedEpisodeReport?.episode?.id;
    if (!episodeId || !selectedEpisodeReport.records.length) return false;
    const episodeRecords = visibleHistory.filter(
      (record) => record.episodeId === episodeId,
    );
    return (
      episodeRecords.length === selectedEpisodeReport.records.length &&
      episodeRecords.every((record) =>
        selectedEpisodeReport.records.some(
          (selectedRecord) => selectedRecord.result.id === record.result.id,
        ),
      )
    );
  }, [selectedEpisodeReport, visibleHistory]);
  const clearPendingMedia = useCallback(() => {
    setPendingMedia((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setMediaError("");
  }, []);

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
          setLocalStorageItem("petflow-profile", JSON.stringify(migrated));
        }
      } catch {
        /* Ignore invalid local snapshots and continue with the default state. */
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
        setPlans([]);
        setProgress([]);
        setVaccinations([]);
        vaccinationTableAvailableRef.current = true;
        clearPendingMedia();
        setMediaUploadWarning("");
        setTesterProfile(null);
        setAiAccess(null);
        setSelectedEpisodeReport(null);
        setSelectedPetId(undefined);
        setAuthReady(true);
        return;
      }
      const [petResult, { data: tester }] = await Promise.all([
        supabase
          .from("pets")
          .select("id,name,species,breed,birth_date,sex,weight,photo_path,created_at")
          .order("created_at", { ascending: true }),
        supabase
          .from("tester_profiles")
          .select("nickname,phone,consent_version,consented_at,phone_consented_at")
          .maybeSingle(),
      ]);
      let petRows: Array<{
        id: string;
        name: string;
        species: PetProfile["species"];
        breed: string | null;
        birth_date: string | null;
        sex: PetProfile["sex"];
        weight: string | null;
        photo_path?: string | null;
      }> = petResult.data ?? [];
      let photoColumnReady = !petResult.error;
      if (isMissingPetPhotoColumnError(petResult.error)) {
        const { data: fallbackPets } = await supabase
          .from("pets")
          .select("id,name,species,breed,birth_date,sex,weight,created_at")
          .order("created_at", { ascending: true });
        petRows = fallbackPets ?? [];
        photoColumnReady = false;
      }
      const loadedPets: PetProfile[] = await Promise.all(
        petRows.map(async (pet) => {
          const photoPath =
            photoColumnReady && "photo_path" in pet ? (pet.photo_path ?? "") : "";
          return {
            id: pet.id,
            name: pet.name,
            species: pet.species,
            breed: pet.breed ?? "",
            birthDate: pet.birth_date ?? "",
            sex: pet.sex,
            weight: pet.weight ?? "",
            photoPath,
            photoUrl: await createPetPhotoSignedUrl(supabase, photoPath),
          };
        }),
      );
      setPets(loadedPets);
      await loadVaccinationsForPets(
        loadedPets.map((pet) => pet.id).filter((id): id is string => Boolean(id)),
      );
      setTesterProfile(
        tester
          ? {
              nickname: tester.nickname,
              phone: tester.phone ?? "",
              consentVersion: tester.consent_version,
              consentedAt: tester.consented_at,
              phoneConsentedAt: tester.phone_consented_at ?? "",
            }
          : null,
      );
      const nextPet = loadedPets[0];
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        setAiAccess(await fetchAiAccessStatus(sessionData.session.access_token));
      } else {
        setAiAccess(null);
      }
      if (nextPet) {
        setProfile(nextPet);
        setSelectedPetId(nextPet.id);
        setInput(profileToHealthInput(nextPet));
        if (sessionData.session && nextPet.id) {
          const timeline = await fetchPetHistory(
            nextPet,
            sessionData.session.access_token,
          );
          setEpisodes(timeline.episodes);
          setPlans(timeline.plans);
          setProgress(timeline.progress);
          setHistory((current) =>
            mergePetHistory(current, timeline.records, nextPet.id as string),
          );
        }
      } else {
        setPlans([]);
        setProgress([]);
        setVaccinations([]);
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
  }, [clearPendingMedia]);

  function persist(records: HistoryRecord[]) {
    setHistory(records);
    setLocalStorageItem("petflow-history", JSON.stringify(records));
  }
  async function uploadPendingMediaFiles({
    reportId,
    clientId,
    accessToken,
    userId,
    petId,
    files,
  }: {
    reportId: string;
    clientId: string;
    accessToken: string;
    userId: string;
    petId: string;
    files: PendingMediaFile[];
  }): Promise<ReportMediaAttachment[]> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !files.length) return [];
    const uploadedPaths: string[] = [];
    const registeredFiles: Array<{
      storagePath: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      kind: ReportMediaKind;
    }> = [];
    try {
      for (const [index, item] of files.entries()) {
        const storagePath = `${userId}/${petId}/${reportId}/${Date.now()}-${index}-${crypto.randomUUID()}.${mediaExtension(item.file)}`;
        const { error: uploadError } = await supabase.storage
          .from(reportMediaBucket)
          .upload(storagePath, item.file, {
            cacheControl: "3600",
            contentType: item.file.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        uploadedPaths.push(storagePath);
        registeredFiles.push({
          storagePath,
          fileName: item.file.name.slice(0, 160),
          mimeType: item.file.type,
          sizeBytes: item.file.size,
          kind: item.kind,
        });
      }

      const response = await fetch(`/api/reports/${reportId}/media`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clientId, files: registeredFiles }),
      });
      const payload = (await response.json()) as {
        media?: ReportMediaAttachment[];
      };
      if (!response.ok || !payload.media) throw new Error("media registration failed");
      return payload.media;
    } catch (error) {
      if (uploadedPaths.length) {
        await supabase.storage.from(reportMediaBucket).remove(uploadedPaths);
      }
      throw error;
    }
  }
  async function loadPetHistory(nextProfile: PetProfile) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !nextProfile.id) return;
    setFlowLoading(true);
    setEpisodes([]);
    setPlans([]);
    setProgress([]);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const timeline = await fetchPetHistory(
        nextProfile,
        data.session.access_token,
      );
      setEpisodes(timeline.episodes);
      setPlans(timeline.plans);
      setProgress(timeline.progress);
      setHistory((current) =>
        mergePetHistory(current, timeline.records, nextProfile.id as string),
      );
    } finally {
      setFlowLoading(false);
    }
  }
  async function loadVaccinationsForPets(petIds: string[]) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !petIds.length) {
      setVaccinations([]);
      return;
    }
    if (!vaccinationTableAvailableRef.current) {
      setVaccinations([]);
      return;
    }
    const { data, error } = await supabase
      .from("pet_vaccinations")
      .select(vaccinationSelectColumns)
      .in("pet_id", petIds)
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (isMissingVaccinationTableError(error)) {
      vaccinationTableAvailableRef.current = false;
      setVaccinations([]);
      return;
    }
    if (error) return;
    setVaccinations(((data ?? []) as VaccinationRow[]).map(toVaccinationRecord));
  }
  async function saveVaccinationForPet(
    userId: string,
    petId: string,
    draft: VaccinationDraft,
  ): Promise<{ deletedId?: string; record?: VaccinationRecord; error?: string }> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return {};
    if (!vaccinationTableAvailableRef.current) {
      return { error: "예방접종 저장 준비가 아직 완료되지 않았어요." };
    }

    if (!hasVaccinationDraft(draft)) {
      if (!draft.id) return {};
      const { error } = await supabase
        .from("pet_vaccinations")
        .delete()
        .eq("id", draft.id)
        .eq("pet_id", petId);
      if (isMissingVaccinationTableError(error)) {
        vaccinationTableAvailableRef.current = false;
        return { error: "예방접종 저장 준비가 아직 완료되지 않았어요." };
      }
      if (error) return { error: "예방접종 일정을 지우지 못했어요." };
      return { deletedId: draft.id };
    }

    const payload = {
      ...(draft.id ? { id: draft.id } : {}),
      user_id: userId,
      pet_id: petId,
      vaccine_name: draft.name.trim(),
      administered_at: draft.administeredAt || null,
      due_at: draft.dueAt || null,
      status: draft.dueAt ? "scheduled" : "done",
      note: draft.note.trim(),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("pet_vaccinations")
      .upsert(payload)
      .select(vaccinationSelectColumns)
      .single();
    if (isMissingVaccinationTableError(error)) {
      vaccinationTableAvailableRef.current = false;
      return { error: "예방접종 저장 준비가 아직 완료되지 않았어요." };
    }
    if (error || !data) return { error: "예방접종 일정을 저장하지 못했어요." };
    return { record: toVaccinationRecord(data as VaccinationRow) };
  }
  function selectPet(nextProfile: PetProfile) {
    setSelectedEpisodeReport(null);
    clearPendingMedia();
    setMediaUploadWarning("");
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
  async function saveProfile(
    nextProfile: PetProfile,
    photo: PetPhotoChange,
    vaccination: VaccinationDraft,
  ): Promise<string | null> {
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
      const saveResult = await supabase
        .from("pets")
        .upsert(payload)
        .select("id,photo_path")
        .single();
      let data: { id: string; photo_path?: string | null } | null = saveResult.data;
      let photoColumnReady = !saveResult.error;
      if (isMissingPetPhotoColumnError(saveResult.error)) {
        const fallbackResult = await supabase
          .from("pets")
          .upsert(payload)
          .select("id")
          .single();
        data = fallbackResult.data;
        photoColumnReady = false;
        if (fallbackResult.error) {
          return "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
        }
      }
      const saveError = saveResult.error && !isMissingPetPhotoColumnError(saveResult.error)
        ? saveResult.error
        : null;
      if (saveError || !data) return "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
      if (!photoColumnReady && (photo.file || photo.remove)) {
        return "사진 저장 준비가 아직 완료되지 않았어요. 잠시 후 다시 시도해 주세요.";
      }
      let photoPath =
        photoColumnReady && "photo_path" in data
          ? (data.photo_path ?? nextProfile.photoPath ?? "")
          : "";
      let photoUrl = nextProfile.photoUrl ?? "";
      const previousPhotoPath = photoPath;

      if (photoColumnReady && photo.remove && previousPhotoPath) {
        const { error: photoUpdateError } = await supabase
          .from("pets")
          .update({ photo_path: null, updated_at: new Date().toISOString() })
          .eq("id", data.id);
        if (photoUpdateError) return "사진을 지우지 못했어요. 잠시 후 다시 시도해 주세요.";
        await supabase.storage.from(petPhotoBucket).remove([previousPhotoPath]);
        photoPath = "";
        photoUrl = "";
      }

      if (photoColumnReady && photo.file) {
        const nextPhotoPath = `${user.id}/${data.id}/${Date.now()}-${crypto.randomUUID()}.${petPhotoExtension(photo.file)}`;
        const { error: uploadError } = await supabase.storage
          .from(petPhotoBucket)
          .upload(nextPhotoPath, photo.file, {
            cacheControl: "3600",
            contentType: photo.file.type,
            upsert: false,
          });
        if (uploadError) return "사진을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";

        const { error: photoUpdateError } = await supabase
          .from("pets")
          .update({ photo_path: nextPhotoPath, updated_at: new Date().toISOString() })
          .eq("id", data.id);
        if (photoUpdateError) {
          await supabase.storage.from(petPhotoBucket).remove([nextPhotoPath]);
          return "사진을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
        }
        if (previousPhotoPath) {
          await supabase.storage.from(petPhotoBucket).remove([previousPhotoPath]);
        }
        photoPath = nextPhotoPath;
        photoUrl = await createPetPhotoSignedUrl(supabase, nextPhotoPath);
      } else if (photoColumnReady && photoPath && !photo.remove) {
        photoUrl = await createPetPhotoSignedUrl(supabase, photoPath);
      }

      savedProfile = { ...nextProfile, id: data.id, photoPath, photoUrl };
      const vaccinationSave = await saveVaccinationForPet(
        user.id,
        data.id,
        vaccination,
      );
      if (vaccinationSave.error) return vaccinationSave.error;
      setVaccinations((current) => {
        if (vaccinationSave.deletedId) {
          return current.filter((item) => item.id !== vaccinationSave.deletedId);
        }
        if (!vaccinationSave.record) return current;
        const exists = current.some((item) => item.id === vaccinationSave.record?.id);
        return exists
          ? current.map((item) =>
              item.id === vaccinationSave.record?.id
                ? (vaccinationSave.record as VaccinationRecord)
                : item,
            )
          : [vaccinationSave.record, ...current];
      });
      setPets((current) => {
        const exists = current.some((pet) => pet.id === savedProfile.id);
        return exists
          ? current.map((pet) => pet.id === savedProfile.id ? savedProfile : pet)
          : [...current, savedProfile];
      });
      setSelectedPetId(savedProfile.id);
    } else if (photo.file || photo.remove) {
      return "사진은 로그인한 계정에 저장할 수 있어요. 먼저 로그인해 주세요.";
    }
    setProfile(savedProfile);
    if (!user) {
      setLocalStorageItem("petflow-profile", JSON.stringify(savedProfile));
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
    setView(profileReturnView, { history: "replace" });
    return null;
  }
  async function handleAuth(
    mode: "login" | "signup",
    email: string,
    password: string,
    tester: Pick<TesterProfile, "nickname" | "phone">,
    consented: boolean,
  ) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return "로그인 설정을 확인하고 있어요. 잠시 후 다시 시도해 주세요.";
    const result = mode === "signup"
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo:
              typeof window === "undefined" ? undefined : window.location.origin,
          },
        })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) return passwordAuthErrorMessage(mode, result.error);
    if (mode === "signup" && !result.data.session) {
      return "가입 확인 메일을 보냈어요. 확인 후 로그인해 주세요.";
    }
    if (mode === "signup" && result.data.user && consented) {
      const profileResult = await saveTesterProfile(tester, consented, result.data.user.id);
      if (profileResult) return profileResult;
    }
    return "";
  }

  async function handleOAuth(provider: OAuthProvider) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || typeof window === "undefined") {
      return "로그인 설정을 확인하고 있어요. 잠시 후 다시 시도해 주세요.";
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      return oauthSignInErrorMessage(provider, error);
    }

    return "";
  }

  async function handleLinkOAuth(provider: OAuthProvider) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || typeof window === "undefined") {
      return "계정 연결 설정을 확인하고 있어요. 잠시 후 다시 시도해 주세요.";
    }

    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) return oauthLinkErrorMessage(provider, error);

    return "";
  }

  async function saveTesterProfile(
    tester: Pick<TesterProfile, "nickname" | "phone">,
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
      consent_version: testerConsentVersion,
      consented_at: consentedAt,
      phone_consented_at: consentedAt,
      updated_at: consentedAt,
    });
    if (profileError) return "계정 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
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
    try {
      await supabase?.auth.signOut();
    } catch {
      // The session may already be gone after account deletion.
    }
    clearPendingMedia();
    setMediaUploadWarning("");
    setProfile(initialProfile);
    setInput(initialInput);
    setPets([]);
    setEpisodes([]);
    setPlans([]);
    setProgress([]);
    setVaccinations([]);
    setTesterProfile(null);
    setAiAccess(null);
    setSelectedEpisodeReport(null);
    setSelectedPetId(undefined);
    setRecordDateKey(toRecordDateKey(new Date()));
    removeLocalStorageItem("petflow-profile");
    setView("home", { history: "replace" });
  }
  function startNew(selectedDateKey?: string) {
    if (!authReady || !user) {
      openAuth("login", "push");
      return;
    }
    if (!testerProfile) {
      setView("account");
      return;
    }
    if (!profile.name.trim()) {
      openProfile("check");
      return;
    }
    setEditingRecord(null);
    setRecordDateKey(
      typeof selectedDateKey === "string" && recordDateKeyToIso(selectedDateKey)
        ? selectedDateKey
        : toRecordDateKey(new Date()),
    );
    clearPendingMedia();
    setMediaUploadWarning("");
    setInput(profileToHealthInput(profile));
    setError("");
    setView("check");
  }

  function startEditRecord(record: HistoryRecord) {
    setEditingRecord(record);
    setRecordDateKey(toRecordDateKey(record.result.createdAt));
    setInput({
      ...record.input,
      petName: profile.name || record.input.petName,
      species: profile.species || record.input.species,
      breed: profile.breed || record.input.breed,
      birthDate: profile.birthDate || record.input.birthDate,
      sex: profile.sex || record.input.sex,
      weight: profile.weight || record.input.weight,
    });
    clearPendingMedia();
    setMediaUploadWarning("");
    setError("");
    setView("check");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteRecord(record: HistoryRecord) {
    const confirmed = window.confirm(
      "이 기록을 삭제할까요?\n삭제하면 병원 전달 요약에서도 빠져요.",
    );
    if (!confirmed) return;

    setAppNotice(null);
    try {
      if (record.result.storage === "remote") {
        const supabase = getSupabaseBrowserClient();
        const { data } = supabase
          ? await supabase.auth.getSession()
          : { data: { session: null } };
        if (!data.session) throw new Error("missing session");
        const response = await fetch(`/api/reports/${record.result.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        if (!response.ok) throw new Error("delete failed");
      }

      const nextHistory = history.filter(
        (item) => item.result.id !== record.result.id,
      );
      persist(nextHistory);
      setSelected((current) =>
        current?.result.id === record.result.id ? null : current,
      );
      setEditingRecord((current) =>
        current?.result.id === record.result.id ? null : current,
      );
      setSelectedEpisodeReport((current) => {
        if (!current) return current;
        const records = current.records.filter(
          (item) => item.result.id !== record.result.id,
        );
        return records.length ? { ...current, records } : null;
      });
      setAppNotice({ tone: "success", text: "기록을 삭제했어요." });
      if (currentView === "result") setView("history", { history: "replace" });
    } catch {
      setAppNotice({
        tone: "error",
        text: "기록을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.",
      });
    }
  }
  async function submit(overrideInput?: HealthCheckInput) {
    const submissionInput = overrideInput ?? input;
    if (!submissionInput.petName.trim()) {
      setError("반려동물 이름을 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setMediaUploadWarning("");
    try {
      const clientId = getOrCreateClientId();
      const supabase = getSupabaseBrowserClient();
      const { data: sessionData } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      if (editingRecord) {
        let media = editingRecord.media ?? [];
        let petId = editingRecord.petId ?? selectedPetId;
        let episodeId = editingRecord.episodeId;
        let result: AnalysisResult;

        if (editingRecord.result.storage === "remote") {
          if (!sessionData.session?.access_token) throw new Error("missing session");
          const response = await fetch(`/api/reports/${editingRecord.result.id}`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${sessionData.session.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(submissionInput),
          });
          if (!response.ok) throw new Error("update failed");
          const payload = (await response.json()) as AnalysisResult & {
            episodeId?: string | null;
            media?: ReportMediaAttachment[];
            petId?: string | null;
          };
          const {
            episodeId: savedEpisodeId,
            media: savedMedia,
            petId: savedPetId,
            ...updatedResult
          } = payload;
          result = updatedResult;
          media = savedMedia ?? media;
          petId = savedPetId ?? petId;
          episodeId = savedEpisodeId ?? undefined;
        } else {
          const localResult = analyzeLocally(submissionInput);
          result = {
            ...localResult,
            id: editingRecord.result.id,
            createdAt: editingRecord.result.createdAt,
            storage: editingRecord.result.storage ?? "local",
          };
        }

        if (pendingMedia.length) {
          if (
            editingRecord.result.storage === "remote" &&
            episodeId &&
            petId &&
            sessionData.session?.access_token &&
            sessionData.session.user.id
          ) {
            try {
              const addedMedia = await uploadPendingMediaFiles({
                reportId: editingRecord.result.id,
                clientId,
                accessToken: sessionData.session.access_token,
                userId: sessionData.session.user.id,
                petId,
                files: pendingMedia,
              });
              media = [...media, ...addedMedia];
            } catch {
              setMediaUploadWarning(
                "기록은 수정됐지만 새 사진·영상은 저장하지 못했어요.",
              );
            }
          } else {
            setMediaUploadWarning(
              "새 사진·영상은 계정에 연결된 서버 기록에만 추가할 수 있어요.",
            );
          }
        }

        const updated: HistoryRecord = {
          ...editingRecord,
          input: submissionInput,
          result,
          petId,
          episodeId,
          media,
        };
        persist(
          history.map((item) =>
            item.result.id === updated.result.id ? updated : item,
          ),
        );
        setSelected(updated);
        setSelectedEpisodeReport((current) =>
          current
            ? {
                ...current,
                records: current.records.map((item) =>
                  item.result.id === updated.result.id ? updated : item,
                ),
              }
            : current,
        );
        setEditingRecord(null);
        clearPendingMedia();
        setView("result", { history: "replace" });
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-petflow-client-id": clientId,
          ...(sessionData.session?.access_token
            ? { Authorization: `Bearer ${sessionData.session.access_token}` }
            : {}),
          ...(selectedPetId ? { "x-petflow-pet-id": selectedPetId } : {}),
          "x-petflow-observed-date": recordDateKey,
        },
        body: JSON.stringify(submissionInput),
      });
      if (!response.ok) throw new Error("analysis failed");
      const responsePayload = (await response.json()) as AnalysisResult & {
        episodeId?: string | null;
      };
      const { episodeId, ...result } = responsePayload;
      let media: ReportMediaAttachment[] = [];
      if (pendingMedia.length) {
        if (
          result.storage === "remote" &&
          episodeId &&
          selectedPetId &&
          sessionData.session?.access_token &&
          sessionData.session.user.id
        ) {
          try {
            media = await uploadPendingMediaFiles({
              reportId: result.id,
              clientId,
              accessToken: sessionData.session.access_token,
              userId: sessionData.session.user.id,
              petId: selectedPetId,
              files: pendingMedia,
            });
          } catch {
            setMediaUploadWarning(
              "기록은 저장됐지만 사진·영상 첨부는 저장하지 못했어요. 필요하면 새 기록에서 다시 첨부해 주세요.",
            );
          }
        } else {
          setMediaUploadWarning(
            "기록은 저장됐지만 사진·영상은 계정에 연결된 기록에서만 저장할 수 있어요.",
          );
        }
      }
      const record: HistoryRecord = {
        input: submissionInput,
        result,
        petId: selectedPetId,
        episodeId: episodeId ?? undefined,
        media,
      };
      clearPendingMedia();
      persist(sortHistoryRecords([record, ...history]).slice(0, 100));
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
      setView("result", { history: "replace" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError(
        editingRecord
          ? "기록을 수정하지 못했어요. 잠시 후 다시 시도해 주세요."
          : "리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
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
  async function savePlan(episodeId: string, tasks: string[]) {
    const supabase = getSupabaseBrowserClient();
    try {
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      if (!data.session) return "로그인 상태를 다시 확인해 주세요.";
      const response = await fetch(`/api/episodes/${episodeId}/plan`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tasks }),
      });
      if (!response.ok) return "병원에서 받은 계획을 저장하지 못했어요.";
      const payload = (await response.json()) as { plan: EpisodePlan };
      setPlans((current) => {
        const exists = current.some((plan) => plan.id === payload.plan.id);
        return exists
          ? current.map((plan) =>
              plan.id === payload.plan.id ? payload.plan : plan,
            )
          : [payload.plan, ...current];
      });
      return "";
    } catch {
      return "병원에서 받은 계획을 저장하지 못했어요.";
    }
  }
  async function togglePlanTask(
    episodeId: string,
    taskId: string,
    completed: boolean,
  ) {
    const supabase = getSupabaseBrowserClient();
    try {
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      if (!data.session) return "로그인 상태를 다시 확인해 주세요.";
      const response = await fetch(`/api/episodes/${episodeId}/plan`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskId, completed }),
      });
      if (!response.ok) return "계획 체크 상태를 저장하지 못했어요.";
      const completedAt = completed ? new Date().toISOString() : null;
      setPlans((current) =>
        current.map((plan) =>
          plan.episodeId === episodeId
            ? {
                ...plan,
                tasks: plan.tasks.map((task) =>
                  task.id === taskId ? { ...task, completedAt } : task,
                ),
              }
            : plan,
        ),
      );
      return "";
    } catch {
      return "계획 체크 상태를 저장하지 못했어요.";
    }
  }
  async function saveProgress(
    episodeId: string,
    input: Pick<
      EpisodeProgress,
      "followUpDay" | "conditionChange" | "appetite" | "energy"
    >,
  ) {
    const supabase = getSupabaseBrowserClient();
    try {
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      if (!data.session) return "로그인 상태를 다시 확인해 주세요.";
      const response = await fetch(`/api/episodes/${episodeId}/progress`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      if (!response.ok) return "경과 기록을 저장하지 못했어요.";
      const payload = (await response.json()) as {
        progress: EpisodeProgress;
      };
      setProgress((current) => {
        const exists = current.some(
          (item) => item.id === payload.progress.id,
        );
        return exists
          ? current.map((item) =>
              item.id === payload.progress.id ? payload.progress : item,
            )
          : [...current, payload.progress].sort(
              (a, b) => a.followUpDay - b.followUpDay,
            );
      });
      setEpisodes((current) =>
        current.map((episode) =>
          episode.id === episodeId
            ? { ...episode, lastActivityAt: payload.progress.recordedAt }
            : episode,
        ),
      );
      return "";
    } catch {
      return "경과 기록을 저장하지 못했어요.";
    }
  }
  async function createVetDraft(episodeId: string, reportIds?: string[]) {
    const supabase = getSupabaseBrowserClient();
    try {
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      if (!data.session) return { error: "로그인 상태를 다시 확인해 주세요." };
      const response = await fetch(`/api/episodes/${episodeId}/vet-draft`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reportIds }),
      });
      const payload = (await response.json()) as {
        draft?: VetReviewDraft;
        access?: AiAccessStatus;
        error?: string;
      };
      if (!response.ok || !payload.draft) {
        if (payload.access) setAiAccess(payload.access);
        return { error: payload.error ?? "AI 병원 요약을 만들지 못했어요." };
      }
      setAiAccess(await fetchAiAccessStatus(data.session.access_token));
      return { draft: payload.draft };
    } catch {
      return { error: "AI 병원 요약을 만들지 못했어요." };
    }
  }
  async function submitAiReportFeedback(input: AiReportFeedbackInput) {
    const supabase = getSupabaseBrowserClient();
    try {
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      if (!data.session) return "로그인 상태를 다시 확인해 주세요.";
      const response = await fetch("/api/ai-report-feedback", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) return payload.error ?? "피드백을 저장하지 못했어요.";
      return "";
    } catch {
      return "피드백을 저장하지 못했어요.";
    }
  }

  async function requestAccountDeletion() {
    const supabase = getSupabaseBrowserClient();
    try {
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      if (!data.session) return "로그인 상태를 다시 확인해 주세요.";
      const response = await fetch("/api/account-deletion", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        return payload.error ?? "계정 탈퇴를 완료하지 못했어요.";
      }
      await logout();
      return "";
    } catch {
      return "계정 탈퇴를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";
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
      <SideNav
        view={currentView}
        setView={setView}
        onStart={startNew}
        onAccount={() =>
          user
            ? setView("account", { history: "replace" })
            : openAuth("login")
        }
        authReady={authReady}
        signedIn={Boolean(user)}
        canUseApp={Boolean(user && testerProfile)}
      />
      <header className="mobile-header">
        <Brand small onClick={() => setView("home", { history: "replace" })} />
        <button
          className="mobile-account"
          onClick={() =>
            user
              ? setView("account", { history: "replace" })
              : openAuth("login")
          }
        >
          {authReady && user ? "내 계정" : "로그인"}
        </button>
      </header>
      <main className="app-main">
        {appNotice && (
          <div
            className={`app-notice ${appNotice.tone}`}
            role={appNotice.tone === "error" ? "alert" : "status"}
          >
            <span>{appNotice.text}</span>
            <button type="button" onClick={() => setAppNotice(null)}>
              닫기
            </button>
          </div>
        )}
        {currentView === "home" && (
          <HomeView
            authReady={authReady}
            signedIn={Boolean(user)}
            accountComplete={Boolean(testerProfile)}
            profile={profile}
            history={visibleHistory}
            onStart={startNew}
            onHistory={() =>
              user
                ? setView("history", { history: "replace" })
                : openAuth("login")
            }
            onProfile={() => openProfile("home")}
            onAccount={() => setView("account", { history: "replace" })}
            onLogin={() => openAuth("login")}
            onSignup={() => openAuth("signup")}
            flow={healthFlow}
            flowLoading={flowLoading}
            activeEpisode={activeEpisode}
            activeEpisodeProgressCount={activeEpisodeProgressCount}
            vaccinations={selectedPetVaccinations}
          />
        )}{" "}
        {currentView === "profile" && (
          <ProfileView
            key={`${editingProfile.id ?? "new-pet"}:${editingProfileVaccinationKey}`}
            profile={editingProfile}
            vaccinations={editingProfileVaccinations}
            onCancel={() => setView(profileReturnView, { history: "replace" })}
            onSave={saveProfile}
          />
        )}{" "}
        {currentView === "account" && (
          <AccountView
            key={`${user?.id ?? "guest"}:${testerProfile?.consentVersion ?? "none"}:${testerProfile?.phone ?? "none"}:${authEntryMode}`}
            user={user}
            testerProfile={testerProfile}
            aiAccess={aiAccess}
            pets={pets}
            selectedPetId={selectedPetId}
            authReady={authReady}
            initialMode={authEntryMode}
            onBack={() => setView("home", { history: "replace" })}
            onAuth={handleAuth}
            onOAuth={handleOAuth}
            onLinkOAuth={handleLinkOAuth}
            onSaveTesterProfile={saveTesterProfile}
            onRequestAccountDeletion={requestAccountDeletion}
            onLogout={logout}
            onAddPet={() => openProfile("account", initialProfile)}
            onEditPet={(pet) => openProfile("account", pet)}
            onSelectPet={(pet) => {
              selectPet(pet);
              setView("home", { history: "replace" });
            }}
          />
        )}{" "}
        {currentView === "check" && (
          <CheckView
            input={input}
            profile={profile}
            recordDateKey={recordDateKey}
            setInput={setInput}
            isEditing={Boolean(editingRecord)}
            existingMedia={editingRecord?.media ?? []}
            mediaFiles={pendingMedia}
            setMediaFiles={setPendingMedia}
            mediaEnabled={Boolean(
              user &&
                selectedPetId &&
                (!editingRecord || editingRecord.result.storage === "remote"),
            )}
            mediaError={mediaError}
            setMediaError={setMediaError}
            onBack={() => setView("home", { history: "replace" })}
            onEditProfile={() => openProfile("check")}
            onSubmit={submit}
            loading={loading}
            error={error}
          />
        )}{" "}
        {currentView === "result" && selected && (
          <ResultView
            key={selected.result.id}
            record={selected}
            mediaWarning={mediaUploadWarning}
            canUseAiReport={Boolean(aiAccess?.enabled)}
            aiAccess={aiAccess}
            onHome={() => setView("home", { history: "replace" })}
            onRestart={startNew}
            onEdit={startEditRecord}
            onDelete={(record) => void deleteRecord(record)}
            onFeedback={updateFeedback}
            onCreateVetDraft={createVetDraft}
          />
        )}{" "}
        {currentView === "history" && (
          <HistoryView
            key={selectedPetId ?? "local-history"}
            history={visibleHistory}
            flow={healthFlow}
            episodes={episodes}
            onBack={() => setView("home", { history: "replace" })}
            onStart={startNew}
            onEdit={startEditRecord}
            onDelete={(record) => void deleteRecord(record)}
            onCloseEpisode={closeEpisode}
            closingEpisodeId={closingEpisodeId}
            episodeError={episodeError}
            onOpenReport={(records, episode) => {
              setSelectedEpisodeReport({ records, episode });
              setView("episode-report");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            onSelect={(record) => {
              setMediaUploadWarning("");
              setSelected(record);
              setView("result");
            }}
          />
        )}
        {currentView === "episode-report" && selectedEpisodeReport && (
          <EpisodeReportView
            key={
              selectedEpisodeReport.episode?.id ??
              selectedEpisodeReport.records.map((record) => record.result.id).join(":")
            }
            selection={selectedEpisodeReport}
            petName={profile.name}
            plan={
              selectedReportIsWholeEpisode && selectedEpisodeReport.episode
                ? plans.find(
                    (plan) =>
                      plan.episodeId === selectedEpisodeReport.episode?.id,
                  )
                : undefined
            }
            progress={
              selectedReportIsWholeEpisode && selectedEpisodeReport.episode
                ? progress.filter(
                    (item) =>
                      item.episodeId === selectedEpisodeReport.episode?.id,
                  )
                : []
            }
            onBack={() => setView("history", { history: "replace" })}
            onSavePlan={savePlan}
            onTogglePlanTask={togglePlanTask}
            onSaveProgress={saveProgress}
            onCreateVetDraft={createVetDraft}
            canUseAiReport={Boolean(aiAccess?.enabled)}
            aiAccess={aiAccess}
            onSaveAiFeedback={submitAiReportFeedback}
            onSelectRecord={(record) => {
              setMediaUploadWarning("");
              setSelected(record);
              setView("result");
            }}
          />
        )}
      </main>
      {user && testerProfile && (
        <MobileNav view={currentView} setView={setView} onStart={startNew} />
      )}
    </div>
  );
}
