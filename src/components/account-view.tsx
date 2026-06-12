"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { PetProfile } from "@/lib/types";
import { Icon } from "./icon";

type AuthMode = "login" | "signup";

export function AccountView({
  user,
  pets,
  selectedPetId,
  authReady,
  onBack,
  onAuth,
  onLogout,
  onAddPet,
  onEditPet,
  onSelectPet,
}: {
  user: User | null;
  pets: PetProfile[];
  selectedPetId?: string;
  authReady: boolean;
  onBack: () => void;
  onAuth: (mode: AuthMode, email: string, password: string) => Promise<string>;
  onLogout: () => Promise<void>;
  onAddPet: () => void;
  onEditPet: (pet: PetProfile) => void;
  onSelectPet: (pet: PetProfile) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    if (!email.trim() || password.length < 6) {
      setMessage("이메일과 6자 이상의 비밀번호를 입력해 주세요.");
      return;
    }
    setLoading(true);
    setMessage("");
    setMessage(await onAuth(mode, email.trim(), password));
    setLoading(false);
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
          <p>
            {user
              ? "여러 반려동물을 등록하고 오늘 기록할 아이를 골라주세요."
              : "로그인하면 반려동물 정보를 다른 기기에서도 불러올 수 있어요."}
          </p>
        </div>
      </div>

      {!authReady ? (
        <div className="panel account-loading">계정 확인 중...</div>
      ) : user ? (
        <div className="account-stack">
          <section className="panel account-summary">
            <div>
              <small>로그인 계정</small>
              <strong>{user.email}</strong>
            </div>
            <button className="text-button" onClick={onLogout}>로그아웃</button>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>반려동물 {pets.length}마리</h3>
              <button className="text-button" onClick={onAddPet}>+ 추가</button>
            </div>
            {pets.length ? (
              <div className="pet-list">
                {pets.map((pet) => (
                  <div
                    className={`pet-list-item ${pet.id === selectedPetId ? "selected" : ""}`}
                    key={pet.id}
                  >
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
                <button className="primary-button" onClick={onAddPet}>
                  <Icon name="plus" size={17} /> 첫 반려동물 등록
                </button>
              </div>
            )}
          </section>
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
            <input id="authPassword" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6자 이상" onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} />
          </div>
          {message && <div className="form-error" role="alert">{message}</div>}
          <button className="primary-button auth-submit" onClick={submit} disabled={loading}>
            {loading ? "확인 중..." : mode === "login" ? "로그인" : "가입하고 시작"}
          </button>
          <p className="auth-note">테스트 단계에서는 이메일을 로그인 식별 용도로만 사용합니다.</p>
        </section>
      )}
    </div>
  );
}
