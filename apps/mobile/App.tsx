import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { testerConsentVersion, testerPrivacySummary } from "./src/lib/privacy";
import { formatKoreanMobile, normalizeKoreanMobile } from "./src/lib/phone";
import { getSupabaseClient, isSupabaseConfigured } from "./src/lib/supabase";

type AuthMode = "login" | "signup";
type Species = "dog" | "cat" | "other";
type PetSex = "unknown" | "male" | "female" | "neutered-male" | "spayed-female";

interface TesterProfile {
  nickname: string;
  phone: string;
  consentVersion: string;
  consentedAt: string;
  phoneConsentedAt: string;
}

interface TesterDraft {
  nickname: string;
  phone: string;
  consented: boolean;
}

interface PetProfile {
  id?: string;
  name: string;
  species: Species;
  breed: string;
  birthDate: string;
  sex: PetSex;
  weight: string;
}

type PetDraft = Omit<PetProfile, "id">;

const emptyDraft: TesterDraft = {
  nickname: "",
  phone: "",
  consented: false,
};

const emptyPetDraft: PetDraft = {
  name: "",
  species: "dog",
  breed: "",
  birthDate: "",
  sex: "unknown",
  weight: "",
};

const speciesOptions: Array<{ id: Species; label: string }> = [
  { id: "dog", label: "강아지" },
  { id: "cat", label: "고양이" },
  { id: "other", label: "기타" },
];

const sexOptions: Array<{ id: PetSex; label: string }> = [
  { id: "unknown", label: "모름" },
  { id: "male", label: "남아" },
  { id: "female", label: "여아" },
  { id: "neutered-male", label: "중성화 남아" },
  { id: "spayed-female", label: "중성화 여아" },
];

export default function App() {
  const configured = isSupabaseConfigured();
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [draft, setDraft] = useState<TesterDraft>(emptyDraft);
  const [user, setUser] = useState<User | null>(null);
  const [testerProfile, setTesterProfile] = useState<TesterProfile | null>(null);
  const [pets, setPets] = useState<PetProfile[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string>();
  const [petDraft, setPetDraft] = useState<PetDraft>(emptyPetDraft);
  const [editingPetId, setEditingPetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [petLoading, setPetLoading] = useState(false);
  const [petMessage, setPetMessage] = useState("");

  const needsTesterProfile = Boolean(
    user &&
      (!testerProfile ||
        testerProfile.consentVersion !== testerConsentVersion ||
        !normalizeKoreanMobile(testerProfile.phone)),
  );

  const headline = useMemo(() => {
    if (!configured) return "앱 환경을 먼저 연결해요";
    if (!authReady) return "계정 확인 중";
    if (!user) return "계정으로 이어서 관리";
    if (needsTesterProfile) return "테스터 정보를 확인해요";
    if (!pets.length) return "첫 반려동물을 등록해요";
    return "오늘 기록할 반려동물을 골라요";
  }, [authReady, configured, needsTesterProfile, pets.length, user]);

  const loadAccount = useCallback(async (nextUser: User | null) => {
    setUser(nextUser);
    setMessage("");
    setPetMessage("");
    if (!nextUser) {
      setTesterProfile(null);
      setDraft(emptyDraft);
      setPets([]);
      setSelectedPetId(undefined);
      setPetDraft(emptyPetDraft);
      setEditingPetId(null);
      setAuthReady(true);
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    const [{ data, error }, { data: petRows, error: petsError }] = await Promise.all([
      supabase
        .from("tester_profiles")
        .select(
          "nickname,phone,consent_version,consented_at,phone_consented_at",
        )
        .eq("user_id", nextUser.id)
        .maybeSingle(),
      supabase
        .from("pets")
        .select("id,name,species,breed,birth_date,sex,weight,created_at")
        .eq("user_id", nextUser.id)
        .order("created_at", { ascending: true }),
    ]);

    if (error) {
      setMessage("테스터 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
    if (petsError) {
      setPetMessage("반려동물 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    }

    const profile = data
      ? {
          nickname: data.nickname ?? "",
          phone: data.phone ?? "",
          consentVersion: data.consent_version ?? "",
          consentedAt: data.consented_at ?? "",
          phoneConsentedAt: data.phone_consented_at ?? "",
        }
      : null;

    setTesterProfile(profile);
    const loadedPets: PetProfile[] = (petRows ?? []).map((pet) => ({
      id: pet.id,
      name: pet.name,
      species: pet.species,
      breed: pet.breed ?? "",
      birthDate: pet.birth_date ?? "",
      sex: pet.sex,
      weight: pet.weight ?? "",
    }));
    setPets(loadedPets);
    setSelectedPetId((current) =>
      current && loadedPets.some((pet) => pet.id === current)
        ? current
        : loadedPets[0]?.id,
    );
    if (!loadedPets.length) {
      setPetDraft(emptyPetDraft);
      setEditingPetId(null);
    }
    setDraft(
      profile
        ? {
            nickname: profile.nickname,
            phone: formatKoreanMobile(profile.phone),
            consented: profile.consentVersion === testerConsentVersion,
          }
        : emptyDraft,
    );
    setAuthReady(true);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    void supabase.auth.getUser().then(({ data }) => loadAccount(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadAccount(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, [loadAccount]);

  async function saveTesterProfile(nextUser = user) {
    const supabase = getSupabaseClient();
    const phone = normalizeKoreanMobile(draft.phone);
    if (!supabase || !nextUser) return "로그인 상태를 다시 확인해 주세요.";
    if (!draft.nickname.trim() || !phone || !draft.consented) {
      return "닉네임, 010 휴대전화번호와 필수 동의를 확인해 주세요.";
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("tester_profiles").upsert({
      user_id: nextUser.id,
      nickname: draft.nickname.trim(),
      phone,
      consent_version: testerConsentVersion,
      consented_at: now,
      phone_consented_at: now,
      updated_at: now,
    });

    if (error) return "테스터 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";

    setTesterProfile({
      nickname: draft.nickname.trim(),
      phone,
      consentVersion: testerConsentVersion,
      consentedAt: now,
      phoneConsentedAt: now,
    });
    return "";
  }

  async function submitAuth() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setMessage("Supabase 공개 환경변수를 먼저 설정해 주세요.");
      return;
    }
    if (!email.trim() || password.length < 6) {
      setMessage("이메일과 6자 이상의 비밀번호를 입력해 주세요.");
      return;
    }
    if (
      authMode === "signup" &&
      (!draft.nickname.trim() || !normalizeKoreanMobile(draft.phone) || !draft.consented)
    ) {
      setMessage("닉네임, 010 휴대전화번호와 필수 동의를 확인해 주세요.");
      return;
    }

    setLoading(true);
    setMessage("");
    const result =
      authMode === "signup"
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (result.error) {
      setMessage(
        result.error.message === "Invalid login credentials"
          ? "이메일 또는 비밀번호를 확인해 주세요."
          : "계정을 처리하지 못했어요. 입력 내용을 확인해 주세요.",
      );
      setLoading(false);
      return;
    }

    if (authMode === "signup" && !result.data.session) {
      setMessage("가입 확인 메일을 보냈어요. 확인 후 로그인해 주세요.");
      setLoading(false);
      return;
    }

    if (authMode === "signup" && result.data.user) {
      const saveMessage = await saveTesterProfile(result.data.user);
      setMessage(saveMessage || "가입 정보가 저장됐어요.");
    }
    setLoading(false);
  }

  async function submitTesterProfile() {
    setLoading(true);
    const saveMessage = await saveTesterProfile();
    setMessage(saveMessage || "테스터 정보가 저장됐어요.");
    setLoading(false);
  }

  async function signOut() {
    const supabase = getSupabaseClient();
    setLoading(true);
    await supabase?.auth.signOut();
    setLoading(false);
  }

  function startNewPet() {
    setEditingPetId(null);
    setPetDraft(emptyPetDraft);
    setPetMessage("");
  }

  function startEditingPet(pet: PetProfile) {
    setEditingPetId(pet.id ?? null);
    setPetDraft({
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      birthDate: pet.birthDate,
      sex: pet.sex,
      weight: pet.weight,
    });
    setPetMessage("");
  }

  async function savePetProfile() {
    const supabase = getSupabaseClient();
    if (!supabase || !user) {
      setPetMessage("로그인 상태를 다시 확인해 주세요.");
      return;
    }
    if (!petDraft.name.trim()) {
      setPetMessage("반려동물 이름을 입력해 주세요.");
      return;
    }
    if (petDraft.birthDate && !isDateInput(petDraft.birthDate)) {
      setPetMessage("생일은 YYYY-MM-DD 형식으로 입력해 주세요.");
      return;
    }

    setPetLoading(true);
    setPetMessage("");
    const payload = {
      ...(editingPetId ? { id: editingPetId } : {}),
      user_id: user.id,
      name: petDraft.name.trim(),
      species: petDraft.species,
      breed: petDraft.breed.trim() || null,
      birth_date: petDraft.birthDate.trim() || null,
      sex: petDraft.sex,
      weight: petDraft.weight.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("pets")
      .upsert(payload)
      .select("id")
      .single();
    setPetLoading(false);

    if (error || !data) {
      setPetMessage("반려동물 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const savedPet: PetProfile = { ...petDraft, name: petDraft.name.trim(), id: data.id };
    setPets((current) => {
      const exists = current.some((pet) => pet.id === data.id);
      return exists
        ? current.map((pet) => (pet.id === data.id ? savedPet : pet))
        : [...current, savedPet];
    });
    setSelectedPetId(data.id);
    setEditingPetId(null);
    setPetDraft(emptyPetDraft);
    setPetMessage("반려동물 정보가 저장됐어요.");
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.badge}>
            <Text style={styles.badgeText}>PETFLOW APP</Text>
          </View>

          <Text style={styles.title}>{headline}</Text>
          <Text style={styles.description}>
            로그인 세션을 앱에 저장하고, 테스터 필수 정보를 웹과 같은 DB 구조로
            관리하는 단계예요.
          </Text>

          {!configured ? (
            <ConfigurationCard />
          ) : !authReady ? (
            <LoadingCard />
          ) : user ? (
            <>
              <AccountCard
                user={user}
                testerProfile={testerProfile}
                onSignOut={signOut}
                disabled={loading}
              />
              {needsTesterProfile ? (
                <TesterProfileForm
                  draft={draft}
                  setDraft={setDraft}
                  loading={loading}
                  message={message}
                  onSubmit={submitTesterProfile}
                />
              ) : (
                <>
                  <PetManager
                    draft={petDraft}
                    editingPetId={editingPetId}
                    loading={petLoading}
                    message={petMessage}
                    pets={pets}
                    selectedPetId={selectedPetId}
                    setDraft={setPetDraft}
                    onEdit={startEditingPet}
                    onNew={startNewPet}
                    onSave={savePetProfile}
                    onSelect={setSelectedPetId}
                  />
                  {selectedPetId ? <NextStepCard /> : null}
                </>
              )}
            </>
          ) : (
            <AuthForm
              mode={authMode}
              setMode={setAuthMode}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              draft={draft}
              setDraft={setDraft}
              loading={loading}
              message={message}
              onSubmit={submitAuth}
            />
          )}

          <Text style={styles.notice}>
            AI 리포트와 비밀키는 앱이 아니라 서버에서만 관리합니다.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function isDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function ConfigurationCard() {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>환경변수가 필요해요</Text>
      <Text style={styles.cardText}>
        `apps/mobile/.env`에 `EXPO_PUBLIC_SUPABASE_URL`과
        `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 넣으면 모바일 로그인 테스트를
        시작할 수 있어요.
      </Text>
    </View>
  );
}

function LoadingCard() {
  return (
    <View style={[styles.card, styles.loadingCard]}>
      <ActivityIndicator color={colors.green} />
      <Text style={styles.cardText}>저장된 로그인 세션을 확인하고 있어요.</Text>
    </View>
  );
}

function AuthForm({
  mode,
  setMode,
  email,
  setEmail,
  password,
  setPassword,
  draft,
  setDraft,
  loading,
  message,
  onSubmit,
}: {
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  draft: TesterDraft;
  setDraft: (draft: TesterDraft) => void;
  loading: boolean;
  message: string;
  onSubmit: () => Promise<void>;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.authTabs}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.tabButton, mode === "login" && styles.tabButtonActive]}
          onPress={() => setMode("login")}
        >
          <Text style={[styles.tabText, mode === "login" && styles.tabTextActive]}>
            로그인
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.tabButton, mode === "signup" && styles.tabButtonActive]}
          onPress={() => setMode("signup")}
        >
          <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>
            회원가입
          </Text>
        </TouchableOpacity>
      </View>

      <FieldLabel label="이메일" />
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="test@example.com"
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        textContentType="emailAddress"
        value={email}
      />

      <FieldLabel label="비밀번호" />
      <TextInput
        autoCapitalize="none"
        onChangeText={setPassword}
        placeholder="6자 이상"
        placeholderTextColor={colors.placeholder}
        secureTextEntry
        style={styles.input}
        textContentType={mode === "login" ? "password" : "newPassword"}
        value={password}
      />

      {mode === "signup" && (
        <TesterFields draft={draft} setDraft={setDraft} />
      )}

      <Message text={message} />
      <PrimaryButton
        disabled={loading}
        label={loading ? "확인 중..." : mode === "login" ? "로그인" : "가입하고 시작"}
        onPress={onSubmit}
      />
    </View>
  );
}

function TesterProfileForm({
  draft,
  setDraft,
  loading,
  message,
  onSubmit,
}: {
  draft: TesterDraft;
  setDraft: (draft: TesterDraft) => void;
  loading: boolean;
  message: string;
  onSubmit: () => Promise<void>;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>테스터 필수 정보</Text>
      <Text style={styles.cardText}>
        웹과 같은 기준으로 닉네임과 010 휴대전화번호를 저장해요.
      </Text>
      <TesterFields draft={draft} setDraft={setDraft} />
      <Message text={message} />
      <PrimaryButton
        disabled={loading}
        label={loading ? "저장 중..." : "테스터 정보 저장"}
        onPress={onSubmit}
      />
    </View>
  );
}

function TesterFields({
  draft,
  setDraft,
}: {
  draft: TesterDraft;
  setDraft: (draft: TesterDraft) => void;
}) {
  return (
    <View style={styles.formBlock}>
      <FieldLabel label="닉네임" />
      <TextInput
        maxLength={30}
        onChangeText={(nickname) => setDraft({ ...draft, nickname })}
        placeholder="예: 보리보호자"
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        value={draft.nickname}
      />

      <FieldLabel label="휴대전화번호" />
      <TextInput
        keyboardType="phone-pad"
        onChangeText={(phone) => setDraft({ ...draft, phone: formatKoreanMobile(phone) })}
        placeholder="010-1234-5678"
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        textContentType="telephoneNumber"
        value={draft.phone}
      />

      <View style={styles.privacyBox}>
        <Text style={styles.privacyTitle}>수집 정보와 이용 안내</Text>
        <InfoRow label="필수" value={testerPrivacySummary.required} />
        <InfoRow label="목적" value={testerPrivacySummary.purpose} />
        <InfoRow label="보관" value={testerPrivacySummary.retention} />
        <Text style={styles.privacyText}>
          전화번호는 광고나 마케팅에 사용하지 않습니다.
        </Text>
      </View>

      <View style={styles.consentRow}>
        <Switch
          onValueChange={(consented) => setDraft({ ...draft, consented })}
          thumbColor="#ffffff"
          trackColor={{ false: "#d8e6df", true: colors.green }}
          value={draft.consented}
        />
        <Text style={styles.consentText}>
          휴대전화번호를 포함한 필수 개인정보 수집·이용에 동의합니다.
        </Text>
      </View>
    </View>
  );
}

function AccountCard({
  user,
  testerProfile,
  disabled,
  onSignOut,
}: {
  user: User;
  testerProfile: TesterProfile | null;
  disabled: boolean;
  onSignOut: () => Promise<void>;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardEyebrow}>SIGNED IN</Text>
      <Text style={styles.cardTitle}>
        {testerProfile?.nickname || user.email || "테스터"}
      </Text>
      <Text style={styles.cardText}>{user.email}</Text>
      {testerProfile?.phone ? (
        <Text style={styles.cardText}>{formatKoreanMobile(testerProfile.phone)}</Text>
      ) : null}
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={disabled}
        onPress={onSignOut}
        style={styles.secondaryButton}
      >
        <Text style={styles.secondaryButtonText}>로그아웃</Text>
      </TouchableOpacity>
    </View>
  );
}

function PetManager({
  draft,
  editingPetId,
  loading,
  message,
  pets,
  selectedPetId,
  setDraft,
  onEdit,
  onNew,
  onSave,
  onSelect,
}: {
  draft: PetDraft;
  editingPetId: string | null;
  loading: boolean;
  message: string;
  pets: PetProfile[];
  selectedPetId?: string;
  setDraft: (draft: PetDraft) => void;
  onEdit: (pet: PetProfile) => void;
  onNew: () => void;
  onSave: () => Promise<void>;
  onSelect: (petId: string) => void;
}) {
  const selectedPet = pets.find((pet) => pet.id === selectedPetId);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardEyebrow}>MY PETS</Text>
          <Text style={styles.cardTitle}>반려동물 {pets.length}마리</Text>
        </View>
        <TouchableOpacity activeOpacity={0.85} onPress={onNew} style={styles.smallButton}>
          <Text style={styles.smallButtonText}>+ 추가</Text>
        </TouchableOpacity>
      </View>

      {pets.length ? (
        <View style={styles.petList}>
          {pets.map((pet) => (
            <View
              key={pet.id}
              style={[
                styles.petListItem,
                pet.id === selectedPetId && styles.petListItemSelected,
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => pet.id && onSelect(pet.id)}
                style={styles.petSelectArea}
              >
                <View style={styles.petAvatar}>
                  <Text style={styles.petAvatarText}>
                    {speciesLabel(pet.species).slice(0, 1)}
                  </Text>
                </View>
                <View style={styles.petListText}>
                  <Text style={styles.petName}>{pet.name}</Text>
                  <Text style={styles.petMeta}>
                    {speciesLabel(pet.species)}
                    {pet.breed ? ` · ${pet.breed}` : ""}
                    {pet.birthDate ? ` · ${pet.birthDate}` : ""}
                  </Text>
                </View>
                {pet.id === selectedPetId ? (
                  <Text style={styles.selectedPill}>선택됨</Text>
                ) : null}
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => onEdit(pet)}
                style={styles.editButton}
              >
                <Text style={styles.editButtonText}>수정</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.cardText}>
          아직 등록된 반려동물이 없어요. 이름과 종만 입력해도 바로 시작할 수 있어요.
        </Text>
      )}

      {selectedPet ? (
        <View style={styles.selectedPetBox}>
          <Text style={styles.selectedPetLabel}>오늘 기록 대상</Text>
          <Text style={styles.selectedPetName}>{selectedPet.name}</Text>
        </View>
      ) : null}

      <PetForm
        draft={draft}
        editing={Boolean(editingPetId)}
        loading={loading}
        setDraft={setDraft}
        onSave={onSave}
      />
      <Message text={message} />
    </View>
  );
}

function PetForm({
  draft,
  editing,
  loading,
  setDraft,
  onSave,
}: {
  draft: PetDraft;
  editing: boolean;
  loading: boolean;
  setDraft: (draft: PetDraft) => void;
  onSave: () => Promise<void>;
}) {
  return (
    <View style={styles.petForm}>
      <Text style={styles.formTitle}>{editing ? "반려동물 정보 수정" : "반려동물 등록"}</Text>
      <FieldLabel label="이름" />
      <TextInput
        maxLength={30}
        onChangeText={(name) => setDraft({ ...draft, name })}
        placeholder="예: 보리"
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        value={draft.name}
      />

      <FieldLabel label="종" />
      <ChipGroup
        options={speciesOptions}
        selected={draft.species}
        onSelect={(species) => setDraft({ ...draft, species })}
      />

      <FieldLabel label="품종 (선택)" />
      <TextInput
        maxLength={40}
        onChangeText={(breed) => setDraft({ ...draft, breed })}
        placeholder="선택하거나 직접 입력"
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        value={draft.breed}
      />

      <FieldLabel label="생일 (선택)" />
      <TextInput
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        onChangeText={(birthDate) => setDraft({ ...draft, birthDate })}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        value={draft.birthDate}
      />

      <FieldLabel label="성별·중성화 (선택)" />
      <ChipGroup
        options={sexOptions}
        selected={draft.sex}
        onSelect={(sex) => setDraft({ ...draft, sex })}
      />

      <FieldLabel label="체중 (선택)" />
      <TextInput
        maxLength={20}
        onChangeText={(weight) => setDraft({ ...draft, weight })}
        placeholder="예: 4.2kg"
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        value={draft.weight}
      />

      <PrimaryButton
        disabled={loading}
        label={loading ? "저장 중..." : editing ? "수정 저장" : "등록하고 선택"}
        onPress={onSave}
      />
    </View>
  );
}

function ChipGroup<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: Array<{ id: T; label: string }>;
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.chipGroup}>
      {options.map((option) => (
        <TouchableOpacity
          activeOpacity={0.85}
          key={option.id}
          onPress={() => onSelect(option.id)}
          style={[styles.chip, selected === option.id && styles.chipSelected]}
        >
          <Text style={[styles.chipText, selected === option.id && styles.chipTextSelected]}>
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function NextStepCard() {
  const steps = ["오늘 건강 기록 입력", "사진·동영상 첨부", "병원 공유 요약"];
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>다음 작업</Text>
      <Text style={styles.cardText}>
        이제 같은 세션으로 반려동물 등록과 오늘 기록 화면을 연결하면 돼요.
      </Text>
      {steps.map((step, index) => (
        <View key={step} style={styles.stepRow}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>{index + 1}</Text>
          </View>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

function speciesLabel(species: Species) {
  return speciesOptions.find((option) => option.id === species)?.label ?? "기타";
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.label}>{label}</Text>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Message({ text }: { text: string }) {
  if (!text) return null;
  return <Text style={styles.message}>{text}</Text>;
}

function PrimaryButton({
  disabled,
  label,
  onPress,
}: {
  disabled: boolean;
  label: string;
  onPress: () => Promise<void>;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled}
      onPress={() => void onPress()}
      style={[styles.primaryButton, disabled && styles.buttonDisabled]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

const colors = {
  background: "#f2faeb",
  card: "#ffffff",
  green: "#1f936f",
  greenSoft: "#e3f5ec",
  ink: "#11352d",
  muted: "#6a7d75",
  placeholder: "#94a39c",
  line: "#dbe9e2",
  danger: "#b7503f",
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboard: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 40,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  badgeText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  title: {
    marginTop: 22,
    color: colors.ink,
    fontSize: 32,
    fontWeight: "900",
    lineHeight: 39,
  },
  description: {
    marginTop: 12,
    color: colors.muted,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
  },
  card: {
    marginTop: 24,
    borderRadius: 28,
    backgroundColor: colors.card,
    padding: 20,
    shadowColor: "#0a3027",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  loadingCard: {
    alignItems: "center",
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardEyebrow: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
  },
  cardText: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
  },
  authTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#edf5f0",
    paddingVertical: 12,
  },
  tabButtonActive: {
    backgroundColor: colors.green,
  },
  tabText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "900",
  },
  tabTextActive: {
    color: "#ffffff",
  },
  formBlock: {
    marginTop: 4,
  },
  label: {
    marginBottom: 7,
    marginTop: 14,
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 17,
    backgroundColor: "#fbfefd",
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  privacyBox: {
    gap: 7,
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: "#f5fbf7",
    padding: 14,
  },
  privacyTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  privacyText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  infoRow: {
    flexDirection: "row",
    gap: 10,
  },
  infoLabel: {
    width: 34,
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
  },
  infoValue: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  consentRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginTop: 14,
  },
  consentText: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
  },
  message: {
    marginTop: 16,
    color: colors.danger,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
  },
  primaryButton: {
    marginTop: 18,
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: colors.green,
    paddingVertical: 17,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  secondaryButton: {
    marginTop: 16,
    alignItems: "center",
    borderRadius: 18,
    backgroundColor: colors.greenSoft,
    paddingVertical: 13,
  },
  secondaryButtonText: {
    color: colors.green,
    fontSize: 14,
    fontWeight: "900",
  },
  smallButton: {
    borderRadius: 999,
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  smallButtonText: {
    color: colors.green,
    fontSize: 13,
    fontWeight: "900",
  },
  petList: {
    gap: 10,
    marginTop: 16,
  },
  petListItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 19,
    backgroundColor: "#fbfefd",
    padding: 11,
  },
  petListItemSelected: {
    borderColor: colors.green,
    backgroundColor: "#eefaf4",
  },
  petSelectArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  petAvatar: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: colors.greenSoft,
  },
  petAvatarText: {
    color: colors.green,
    fontSize: 15,
    fontWeight: "900",
  },
  petListText: {
    flex: 1,
    minWidth: 0,
  },
  petName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  petMeta: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  selectedPill: {
    borderRadius: 999,
    backgroundColor: colors.green,
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  editButton: {
    borderRadius: 999,
    backgroundColor: "#edf5f0",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  editButtonText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  selectedPetBox: {
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: colors.greenSoft,
    padding: 14,
  },
  selectedPetLabel: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
  },
  selectedPetName: {
    marginTop: 3,
    color: colors.ink,
    fontSize: 19,
    fontWeight: "900",
  },
  petForm: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 4,
  },
  formTitle: {
    marginTop: 12,
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
  },
  chipGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    backgroundColor: "#fbfefd",
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  chipSelected: {
    borderColor: colors.green,
    backgroundColor: colors.green,
  },
  chipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900",
  },
  chipTextSelected: {
    color: "#ffffff",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 14,
  },
  stepNumber: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: colors.greenSoft,
  },
  stepNumberText: {
    color: colors.green,
    fontSize: 14,
    fontWeight: "900",
  },
  stepText: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  notice: {
    marginTop: 18,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    textAlign: "center",
  },
});
