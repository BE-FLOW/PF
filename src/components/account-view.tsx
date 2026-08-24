"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  defaultOAuthProviderStatus,
  fetchOAuthProviderStatus,
  hasLinkedProvider,
  type OAuthProvider,
} from "@/lib/auth-identities";
import type { AiAccessStatus, PetProfile, AccountProfile } from "@/lib/types";
import { Icon } from "./icon";

type AuthMode = "login" | "signup";
type DeploymentHealth = {
  version?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPolicy = [
  { id: "length", label: "8~64자", test: (value: string) => value.length >= 8 && value.length <= 64 },
  { id: "lower", label: "영문 소문자", test: (value: string) => /[a-z]/.test(value) },
  { id: "upper", label: "영문 대문자", test: (value: string) => /[A-Z]/.test(value) },
  { id: "number", label: "숫자 포함", test: (value: string) => /\d/.test(value) },
  { id: "special", label: "특수문자 포함", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

function avatarLabel(value: string, fallback = "펫") {
  return Array.from(value.trim() || fallback).slice(0, 2).join("");
}

function PetProfileAvatar({ pet }: { pet: Pick<PetProfile, "name" | "photoUrl"> }) {
  if (pet.photoUrl) {
    return (
      <span className="pet-profile-avatar has-photo">
        <img src={pet.photoUrl} alt={`${pet.name || "반려동물"} 사진`} />
      </span>
    );
  }

  return <span className="pet-profile-avatar">{avatarLabel(pet.name)}</span>;
}

function isStrongPassword(value: string) {
  return passwordPolicy.every((item) => item.test(value));
}

function PasswordChecklist({ password }: { password: string }) {
  return (
    <div className="password-checklist" aria-label="비밀번호 조건">
      {passwordPolicy.map((item) => {
        const passed = item.test(password);
        return (
          <span className={passed ? "passed" : ""} key={item.id}>
            {passed ? "✓" : "•"} {item.label}
          </span>
        );
      })}
    </div>
  );
}

function aiAccessCopy(access: AiAccessStatus | null) {
  if (!access) {
    return "병원 전달본 이용 가능 횟수를 확인하고 있어요.";
  }
  if (access.reason === "unavailable") {
    return "오늘의 무료 생성 가능 횟수를 확인하지 못했어요. 잠시 후 다시 확인해 주세요.";
  }
  if (access.reason === "attempt_limit") {
    return `오늘 반복 요청 안전 한도에 도달했어요. ${aiAccessResetCopy(access)} 기본 사실 전달본과 기록은 계속 이용할 수 있어요.`;
  }
  if (access.reason === "daily_limit" || access.reason === "no_credits") {
    return `오늘의 무료 AI 정리 한도를 사용했어요. ${aiAccessResetCopy(access)} 기본 사실 전달본과 기록은 계속 이용할 수 있어요.`;
  }
  return `하루 ${access.dailyLimit}회까지 무료이며 오늘 ${access.availableCredits}회 더 만들 수 있어요.`;
}

function aiAccessResetCopy(access: AiAccessStatus) {
  if (!access.resetsAt) return "다음 날 다시 사용할 수 있어요.";
  const resetsAt = new Date(access.resetsAt);
  if (Number.isNaN(resetsAt.getTime())) return "다음 날 다시 사용할 수 있어요.";
  const label = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(resetsAt);
  return `${label}부터 다시 사용할 수 있어요.`;
}

export function AccountView({
  user,
  accountProfile,
  aiAccess,
  pets,
  selectedPetId,
  authReady,
  initialMode = "login",
  passwordRecoveryMode,
  onBack,
  onAuth,
  onRequestPasswordReset,
  onCompletePasswordRecovery,
  onOAuth,
  onLinkOAuth,
  onRequestAccountDeletion,
  onOpenGuide,
  onLogout,
  onAddPet,
  onEditPet,
  onSelectPet,
}: {
  user: User | null;
  accountProfile: AccountProfile | null;
  aiAccess: AiAccessStatus | null;
  pets: PetProfile[];
  selectedPetId?: string;
  authReady: boolean;
  initialMode?: AuthMode;
  passwordRecoveryMode: boolean;
  onBack: () => void;
  onAuth: (
    mode: AuthMode,
    email: string,
    password: string,
  ) => Promise<string>;
  onRequestPasswordReset: (email: string) => Promise<string>;
  onCompletePasswordRecovery: (password: string) => Promise<string>;
  onOAuth: (provider: OAuthProvider) => Promise<string>;
  onLinkOAuth: (provider: OAuthProvider) => Promise<string>;
  onRequestAccountDeletion: () => Promise<string>;
  onOpenGuide: () => void;
  onLogout: () => Promise<void>;
  onAddPet: () => void;
  onEditPet: (pet: PetProfile) => void;
  onSelectPet: (pet: PetProfile) => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [linkLoading, setLinkLoading] = useState<OAuthProvider | null>(null);
  const [message, setMessage] = useState("");
  const [linkMessage, setLinkMessage] = useState("");
  const [enabledOAuthProviders, setEnabledOAuthProviders] = useState(
    defaultOAuthProviderStatus,
  );
  const [deletionSaving, setDeletionSaving] = useState(false);
  const [deletionMessage, setDeletionMessage] = useState("");
  const [deletionRequested, setDeletionRequested] = useState(false);

  const googleLinked = hasLinkedProvider(user, "google");
  const appleLinked = hasLinkedProvider(user, "apple");
  const appleEnabled = enabledOAuthProviders.apple || appleLinked;
  const linkDisabled = linkLoading !== null;
  useEffect(() => {
    let active = true;
    void fetchOAuthProviderStatus(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ).then((status) => {
      if (active) setEnabledOAuthProviders(status);
    });

    return () => {
      active = false;
    };
  }, []);

  async function submitAuth() {
    if (!emailPattern.test(email.trim())) {
      setMessage("이메일 형식을 확인해 주세요.");
      return;
    }
    if (mode === "login" && !password) {
      setMessage("비밀번호를 입력해 주세요.");
      return;
    }
    if (mode === "signup" && !isStrongPassword(password)) {
      setMessage("비밀번호 조건을 모두 충족해 주세요.");
      return;
    }
    setLoading(true);
    setMessage(await onAuth(mode, email.trim(), password));
    setLoading(false);
  }

  async function submitOAuth(provider: OAuthProvider) {
    setOauthLoading(provider);
    setMessage(await onOAuth(provider));
    setOauthLoading(null);
  }

  async function submitOAuthLink(provider: OAuthProvider) {
    setLinkLoading(provider);
    setLinkMessage(await onLinkOAuth(provider));
    setLinkLoading(null);
  }

  async function requestPasswordReset() {
    if (!emailPattern.test(email.trim())) {
      setMessage("재설정 메일을 받을 이메일을 입력해 주세요.");
      return;
    }
    setLoading(true);
    setMessage(await onRequestPasswordReset(email.trim()));
    setLoading(false);
  }

  async function completePasswordRecovery() {
    if (!isStrongPassword(recoveryPassword)) {
      setRecoveryMessage("비밀번호 조건을 모두 충족해 주세요.");
      return;
    }
    setRecoveryLoading(true);
    const result = await onCompletePasswordRecovery(recoveryPassword);
    setRecoveryLoading(false);
    setRecoveryMessage(result || "새 비밀번호를 저장했어요.");
    if (!result) setRecoveryPassword("");
  }

  async function requestDeletion() {
    if (deletionRequested) return;
    const confirmed = window.confirm(
      "계정, 함께하는 아이들, 건강 기록, 사진·영상, 병원 전달본 기록이 삭제됩니다. 이 작업은 되돌리기 어려워요. 계속할까요?",
    );
    if (!confirmed) return;

    setDeletionSaving(true);
    const result = await onRequestAccountDeletion();
    setDeletionSaving(false);
    setDeletionMessage(
      result ||
        "계정 탈퇴가 완료됐어요. 현재 기기에서 로그아웃합니다.",
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
          <h1>{user ? "함께하는 아이들" : "계정으로 이어서 관리"}</h1>
          <p>{user ? "오늘 함께 볼 아이를 골라주세요." : "로그인하면 기록을 이어서 관리할 수 있어요."}</p>
        </div>
      </div>

      {!authReady ? (
        <div className="panel account-loading">계정 확인 중...</div>
      ) : user ? (
        <div className="account-stack">
          {passwordRecoveryMode && (
            <section className="panel account-recovery-panel" aria-live="polite">
              <div>
                <h3>새 비밀번호 설정</h3>
                <p>이메일 로그인에 사용할 새 비밀번호를 입력해 주세요.</p>
              </div>
              <div className="field">
                <label htmlFor="recoveryPassword">새 비밀번호</label>
                <input
                  id="recoveryPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={64}
                  value={recoveryPassword}
                  onChange={(event) => setRecoveryPassword(event.target.value)}
                  placeholder="8자 이상, 대·소문자·숫자·특수문자"
                />
                <PasswordChecklist password={recoveryPassword} />
              </div>
              <button
                className="primary-button compact"
                type="button"
                disabled={recoveryLoading}
                onClick={() => void completePasswordRecovery()}
              >
                {recoveryLoading ? "저장 중..." : "새 비밀번호 저장"}
              </button>
              {recoveryMessage && (
                <p
                  className={recoveryMessage.includes("저장했어요") ? "form-success" : "form-error"}
                  role="status"
                >
                  {recoveryMessage}
                </p>
              )}
            </section>
          )}
          <section className="panel account-summary">
            <div>
              <small>사용자 계정</small>
              <strong>{accountProfile?.nickname || user.email}</strong>
              {accountProfile && <span>{user.email}</span>}
            </div>
            <div className="account-actions">
              <button
                className="text-button muted"
                disabled={deletionSaving}
                onClick={onLogout}
              >
                로그아웃
              </button>
            </div>
          </section>

          <section className="panel identity-link-panel">
            <div className="identity-link-row">
              <div>
                <h3>로그인 연결</h3>
                <p>
                  기존 이메일 계정에 Google 또는 Apple을 연결하면 기록과 병원 전달본 이용 내역이
                  그대로 이어져요.
                </p>
              </div>
            </div>

            <div className="identity-provider-list">
              <div className="identity-provider-row">
                <div className="identity-provider-copy">
                  <strong>Google</strong>
                  <span className={`identity-link-badge ${googleLinked ? "connected" : ""}`}>
                    {googleLinked ? "연결됨" : "연결 전"}
                  </span>
                </div>
                {googleLinked ? (
                  <p className="identity-link-note success">이 계정으로 로그인할 수 있어요.</p>
                ) : (
                  <button
                    className="secondary-button compact identity-link-button"
                    type="button"
                    onClick={() => void submitOAuthLink("google")}
                    disabled={linkDisabled}
                  >
                    {linkLoading === "google" ? "연결 중..." : "연결"}
                  </button>
                )}
              </div>

              {appleEnabled ? (
                <div className="identity-provider-row">
                  <div className="identity-provider-copy">
                    <strong>Apple</strong>
                    <span className={`identity-link-badge ${appleLinked ? "connected" : ""}`}>
                      {appleLinked ? "연결됨" : "연결 전"}
                    </span>
                  </div>
                  {appleLinked ? (
                    <p className="identity-link-note success">이 계정으로 로그인할 수 있어요.</p>
                  ) : (
                    <button
                      className="secondary-button compact identity-link-button"
                      type="button"
                      onClick={() => void submitOAuthLink("apple")}
                      disabled={linkDisabled}
                    >
                      {linkLoading === "apple" ? "연결 중..." : "연결"}
                    </button>
                  )}
                </div>
              ) : null}
            </div>

            {!googleLinked || (appleEnabled && !appleLinked) ? (
              <p className="identity-link-note">
                기록이 나뉘지 않도록 먼저 기존 이메일 계정으로 로그인한 뒤 연결해 주세요.
              </p>
            ) : null}
            {linkMessage && (
              <p
                className={linkMessage.includes("연결했어요") ? "form-success" : "form-error"}
                role="alert"
              >
                {linkMessage}
              </p>
            )}
          </section>

          <section className={`panel ai-access-panel ${aiAccess?.enabled ? "enabled" : ""}`}>
            <div className="panel-head">
              <div>
                <h3>병원 전달본</h3>
                <p>{aiAccessCopy(aiAccess)}</p>
              </div>
              <span className={`ai-access-state ${aiAccess?.enabled ? "enabled" : ""}`}>
                {!aiAccess
                  ? "확인 중"
                  : aiAccess.enabled
                    ? `${aiAccess.availableCredits}회`
                    : aiAccess.reason === "daily_limit" ||
                        aiAccess.reason === "attempt_limit" ||
                        aiAccess.reason === "no_credits"
                      ? "오늘 한도 완료"
                      : "확인 필요"}
              </span>
            </div>
            {aiAccess && aiAccess.reason !== "unavailable" && (
              <div className="ai-usage-row">
                <div>
                  <span>오늘 남은 AI 정리</span>
                  <strong>{aiAccess.availableCredits}회</strong>
                </div>
                <div>
                  <span>일일 한도</span>
                  <strong>{aiAccess.dailyLimit}회</strong>
                </div>
              </div>
            )}
            <p className="ai-trial-hint">
              {aiAccess && aiAccess.reason !== "unavailable"
                ? `${aiAccessResetCopy(aiAccess)} `
                : ""}현재 공개판은 무료이며
              자동 결제나 인앱결제가 없습니다.
            </p>
          </section>

          <button className="panel quick-guide-entry" type="button" onClick={onOpenGuide}>
            <span>
              <strong>사용법 보기</strong>
              <small>기록부터 병원 요약까지 한눈에 확인해요.</small>
            </span>
            <span aria-hidden="true">›</span>
          </button>

          <section className="panel account-deletion-panel">
            <div>
              <h3>계정 탈퇴</h3>
              <p>
                탈퇴하면 계정과 함께하는 아이들, 건강 기록, 사진·영상, 병원 전달본
                이용 기록이 삭제되고 현재 기기에서 로그아웃합니다.
              </p>
            </div>
            <button
              className="secondary-button compact danger-button"
              type="button"
              onClick={requestDeletion}
              disabled={deletionSaving || deletionRequested}
            >
              {deletionRequested
                ? "탈퇴 완료"
                : deletionSaving
                  ? "탈퇴 중..."
                  : "계정 탈퇴"}
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

          <section className="panel">
              <div className="panel-head">
                <h3>함께하는 아이들</h3>
                <button className="text-button" onClick={onAddPet}>+ 추가</button>
              </div>
              {pets.length ? (
                <div className="pet-list">
                  {pets.map((pet) => (
                    <div className={`pet-list-item ${pet.id === selectedPetId ? "selected" : ""}`} key={pet.id}>
                      <button className="pet-select" onClick={() => onSelectPet(pet)}>
                        <PetProfileAvatar pet={pet} />
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
                  <p>아직 등록된 아이가 없어요.</p>
                  <button className="primary-button" onClick={onAddPet}><Icon name="plus" size={17} /> 첫 아이 등록</button>
                </div>
              )}
          </section>
        </div>
      ) : (
        <section className="form-panel auth-panel">
          <div className="auth-tabs auth-entry-tabs" aria-label="계정 시작 방법">
            <button
              className={mode === "login" ? "active" : ""}
              onClick={() => { setMode("login"); setMessage(""); }}
              type="button"
            >
              로그인
            </button>
            <button
              className={mode === "signup" ? "active" : ""}
              onClick={() => { setMode("signup"); setMessage(""); }}
              type="button"
            >
              회원가입
            </button>
          </div>
          <div className="auth-intro">
            <h2>{mode === "login" ? "로그인" : "회원가입"}</h2>
            <p>
              {mode === "login"
                ? "사용하던 계정으로 기록을 이어서 확인해요."
                : "Google, Apple 또는 이메일 계정으로 새로 시작해요."}
            </p>
          </div>
          <div className="oauth-button-group">
            <button
              className="oauth-button"
              onClick={() => void submitOAuth("google")}
              disabled={loading || oauthLoading !== null}
              type="button"
            >
              <span>G</span>
              {oauthLoading === "google"
                ? "Google 확인 중..."
                : mode === "login"
                  ? "Google 계정으로 로그인"
                  : "Google 계정으로 회원가입"}
            </button>
            {enabledOAuthProviders.apple ? (
              <button
                className="oauth-button apple"
                onClick={() => void submitOAuth("apple")}
                disabled={loading || oauthLoading !== null}
                type="button"
              >
                <span></span>
                {oauthLoading === "apple"
                  ? "Apple 확인 중..."
                  : mode === "login"
                    ? "Apple 계정으로 로그인"
                    : "Apple 계정으로 회원가입"}
              </button>
            ) : null}
          </div>
          <p className="auth-note">
            Google은 확인된 이메일을 제공해요.
            {enabledOAuthProviders.apple
              ? " Apple은 사용자가 선택하면 비공개 릴레이 이메일로 연결될 수 있어요."
              : ""}
          </p>
          {message && <div className="form-error" role="alert">{message}</div>}
          <details className="password-auth-fallback">
            <summary>{mode === "login" ? "이메일로 로그인" : "이메일로 회원가입"}</summary>
            <div className="auth-divider"><span>이메일과 비밀번호</span></div>
            <div className="field">
              <label htmlFor="authEmail">이메일</label>
              <input id="authEmail" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
              {mode === "signup" && (
                <small className="field-help">가입 후 이메일 인증을 완료하면 기록을 안전하게 이어갈 수 있어요.</small>
              )}
            </div>
            <div className="field">
              <label htmlFor="authPassword">비밀번호</label>
              <input id="authPassword" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "signup" ? 8 : undefined} maxLength={64} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "signup" ? "8자 이상, 대·소문자·숫자·특수문자" : "비밀번호"} onKeyDown={(event) => { if (event.key === "Enter") void submitAuth(); }} />
              {mode === "signup" && <PasswordChecklist password={password} />}
            </div>
            <button className="primary-button auth-submit" onClick={submitAuth} disabled={loading || oauthLoading !== null}>
              {loading ? "확인 중..." : mode === "login" ? "로그인" : "회원가입"}
            </button>
            {mode === "login" && (
              <button
                className="text-button muted auth-recovery-button"
                type="button"
                disabled={loading || oauthLoading !== null}
                onClick={() => void requestPasswordReset()}
              >
                비밀번호 재설정 메일 받기
              </button>
            )}
          </details>
        </section>
      )}
      <DeploymentInfo />
    </div>
  );
}

function DeploymentInfo() {
  const [health, setHealth] = useState<DeploymentHealth | null>(null);

  useEffect(() => {
    let mounted = true;
    void fetch("/api/health", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: DeploymentHealth | null) => {
        if (mounted) setHealth(payload);
      })
      .catch(() => {
        if (mounted) setHealth(null);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const version = health?.version ?? "dev";

  return (
    <p className="deployment-footnote" aria-label="현재 배포 정보">
      웹 빌드 {version}
    </p>
  );
}
