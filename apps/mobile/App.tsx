import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFonts } from "expo-font";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import type { User } from "@supabase/supabase-js";
import type { TextInputProps, TextProps, TextStyle } from "react-native";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text as NativeText,
  TextInput as NativeTextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { testerConsentVersion, testerPrivacySummary } from "./src/lib/privacy";
import {
  hasLinkedProvider,
  oauthLinkErrorMessage,
  oauthProviderLabels,
  type OAuthProvider,
} from "./src/lib/auth";
import { formatKoreanMobile, normalizeKoreanMobile } from "./src/lib/phone";
import { getSupabaseClient, isSupabaseConfigured } from "./src/lib/supabase";
import {
  analyzeLocally,
  buildEpisodeReport,
  createUuid,
  durationOptions,
  formatFileSize,
  formatReportMediaSummary,
  levelOptions,
  maxReportMediaFiles,
  maxReportMediaSizeBytes,
  profileToHealthInput,
  reportMediaBucket,
  reportMediaExtensionFromMimeType,
  reportMediaKindFromMimeType,
  redFlagOptions,
  resetToNormal,
  riskLabels,
  storedReportToHistoryRecord,
  symptomOptions,
  summarizeHealthFlow,
  toggleItem,
  type AiAccessStatus,
  type AiReportFeedbackInput,
  type AnalysisResult,
  type ConditionChange,
  type DisplayHealthReport,
  type EpisodePlan,
  type EpisodeProgress,
  type EpisodeReport,
  type FollowUpDay,
  type HealthFlowSummary,
  type HealthCheckInput,
  type HistoryRecord,
  type Level,
  type PetEpisode,
  type PetProfile,
  type PetSex,
  type ReportMediaAttachment,
  type ReportMediaKind,
  type Species,
  type VetReviewDraft,
} from "./src/lib/health";

WebBrowser.maybeCompleteAuthSession();

type AuthMode = "login" | "signup";
type MainSection = "home" | "record" | "reports" | "account";

const mainSectionOptions: Array<{ id: MainSection; label: string }> = [
  { id: "home", label: "홈" },
  { id: "record", label: "기록" },
  { id: "reports", label: "보고서" },
  { id: "account", label: "계정" },
];

const mainSectionDescriptions: Record<MainSection, string> = {
  home: "오늘 상태, 최근 기록, 병원 공유 준비를 한눈에 확인해요.",
  record: "오늘 관찰한 변화만 빠르게 남겨요.",
  reports: "기록 흐름, 3·7·14일 경과, 수의사 검토용 초안을 확인해요.",
  account: "테스터 키, GPT 권한, 계정 관리를 한곳에서 확인해요.",
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPolicy = [
  { id: "length", label: "8~64자", test: (value: string) => value.length >= 8 && value.length <= 64 },
  { id: "letter", label: "영문 포함", test: (value: string) => /[A-Za-z]/.test(value) },
  { id: "number", label: "숫자 포함", test: (value: string) => /\d/.test(value) },
  { id: "special", label: "특수문자 포함", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

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

type PetDraft = Omit<PetProfile, "id">;

interface PendingMediaAsset {
  id: string;
  uri: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: ReportMediaKind;
}

interface EpisodeReportGroup {
  key: string;
  episode?: PetEpisode;
  records: HistoryRecord[];
  plan?: EpisodePlan;
  progress: EpisodeProgress[];
  report: EpisodeReport;
  latestAt: string;
}

type NoticeTone = "error" | "success";

interface EpisodeNotice {
  episodeId: string | null;
  text: string;
  tone: NoticeTone;
}

interface ProgressDraft {
  episodeId: string;
  followUpDay: FollowUpDay;
  conditionChange: ConditionChange;
  appetite: Level;
  energy: Level;
}

interface AiFeedbackDraft {
  usefulnessScore: AiReportFeedbackInput["usefulnessScore"];
  wouldPay: AiReportFeedbackInput["wouldPay"];
  price: string;
  comment: string;
}

type VetDraftMap = Record<string, VetReviewDraft>;
type AiFeedbackDraftMap = Record<string, AiFeedbackDraft>;

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

const defaultAiFeedbackDraft: AiFeedbackDraft = {
  usefulnessScore: 5,
  wouldPay: "maybe",
  price: "",
  comment: "",
};

const speciesOptions: Array<{ id: Species; label: string }> = [
  { id: "dog", label: "강아지" },
  { id: "cat", label: "고양이" },
  { id: "other", label: "기타" },
];

const breedOptions: Record<Species, string[]> = {
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
};

const sexOptions: Array<{ id: PetSex; label: string }> = [
  { id: "unknown", label: "모름" },
  { id: "male", label: "남아" },
  { id: "female", label: "여아" },
  { id: "neutered-male", label: "중성화 남아" },
  { id: "spayed-female", label: "중성화 여아" },
];

const conditionChangeOptions: Array<{
  id: ConditionChange;
  label: string;
  description: string;
}> = [
  { id: "better", label: "좋아졌어요", description: "전보다 편안해 보여요" },
  { id: "same", label: "비슷해요", description: "큰 변화가 없어요" },
  { id: "worse", label: "나빠졌어요", description: "불편함이 더 보여요" },
];

const initialFollowUpDays: FollowUpDay[] = [3, 7, 14];
const longTermFollowUpDays: FollowUpDay[] = [30, 60, 90];

const followUpGroups: Array<{
  title: string;
  description: string;
  days: FollowUpDay[];
}> = [
  {
    title: "초기 경과",
    description: "진료 직후 다시 설명해야 하는 변화를 3·7·14일에 남겨요.",
    days: initialFollowUpDays,
  },
  {
    title: "장기 경과",
    description: "다른 병원이나 재진 때 필요한 큰 흐름을 30·60·90일에 남겨요.",
    days: longTermFollowUpDays,
  },
];

const aiFeedbackScoreOptions: Array<{
  id: AiReportFeedbackInput["usefulnessScore"];
  label: string;
}> = [
  { id: 5, label: "5점" },
  { id: 4, label: "4점" },
  { id: 3, label: "3점" },
  { id: 2, label: "2점" },
  { id: 1, label: "1점" },
];

const aiWouldPayOptions: Array<{
  id: AiReportFeedbackInput["wouldPay"];
  label: string;
}> = [
  { id: "maybe", label: "상황에 따라" },
  { id: "yes", label: "낼 의향 있음" },
  { id: "no", label: "아직 없음" },
];

const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://pf-two-eta.vercel.app";

async function fetchAiAccessStatus(accessToken: string) {
  const response = await fetch(`${apiBaseUrl}/api/ai-access`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { access?: AiAccessStatus };
  return payload.access ?? null;
}

function sortHistory(records: HistoryRecord[]) {
  return [...records].sort(
    (a, b) =>
      new Date(b.result.createdAt).getTime() -
      new Date(a.result.createdAt).getTime(),
  );
}

function mergePetHistory(
  current: HistoryRecord[],
  remoteRecords: HistoryRecord[],
  petId: string,
) {
  const otherPets = current.filter((record) => record.petId !== petId);
  const localOnly = current.filter(
    (record) => record.petId === petId && record.result.storage !== "remote",
  );
  return sortHistory([...otherPets, ...remoteRecords, ...localOnly]);
}

function upsertHistoryRecord(current: HistoryRecord[], next: HistoryRecord) {
  return sortHistory([
    next,
    ...current.filter((record) => record.result.id !== next.result.id),
  ]);
}

function mimeTypeFromAsset(asset: ImagePicker.ImagePickerAsset) {
  const explicit = asset.mimeType?.toLowerCase();
  if (explicit) return explicit;
  const extension = (asset.fileName ?? asset.uri)
    .split(/[./]/)
    .pop()
    ?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  if (extension === "mp4") return "video/mp4";
  if (extension === "mov") return "video/quicktime";
  if (extension === "webm") return "video/webm";
  return asset.type === "video" ? "video/mp4" : "image/jpeg";
}

function cleanFileName(name: string) {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "-").trim();
  return (cleaned || `petflow-media-${Date.now()}`).slice(0, 160);
}

function fileNameFromAsset(asset: ImagePicker.ImagePickerAsset, mimeType: string) {
  if (asset.fileName?.trim()) return cleanFileName(asset.fileName);
  const extension = reportMediaExtensionFromMimeType(mimeType);
  return cleanFileName(`petflow-media-${Date.now()}.${extension}`);
}

const petFlowFontAssets = {
  "Pretendard-Regular": require("./assets/fonts/Pretendard-Regular.otf"),
  "Pretendard-SemiBold": require("./assets/fonts/Pretendard-SemiBold.otf"),
  "Pretendard-Bold": require("./assets/fonts/Pretendard-Bold.otf"),
  "Pretendard-ExtraBold": require("./assets/fonts/Pretendard-ExtraBold.otf"),
  "Pretendard-Black": require("./assets/fonts/Pretendard-Black.otf"),
};

const petFlowFontFamilies = {
  regular: "Pretendard-Regular",
  semibold: "Pretendard-SemiBold",
  bold: "Pretendard-Bold",
  extrabold: "Pretendard-ExtraBold",
  black: "Pretendard-Black",
};

let petFlowFontsReady = false;

function fontWeightValue(fontWeight: TextStyle["fontWeight"]) {
  if (fontWeight === "bold") return 700;
  if (fontWeight === "normal" || fontWeight === undefined) return 400;
  return Number(fontWeight) || 400;
}

function fontFamilyForStyle(style: TextProps["style"] | TextInputProps["style"]) {
  const flattened = StyleSheet.flatten(style) as TextStyle | undefined;
  const weight = fontWeightValue(flattened?.fontWeight);
  if (weight >= 900) return petFlowFontFamilies.black;
  if (weight >= 800) return petFlowFontFamilies.extrabold;
  if (weight >= 700) return petFlowFontFamilies.bold;
  if (weight >= 600) return petFlowFontFamilies.semibold;
  return petFlowFontFamilies.regular;
}

function Text({ style, ...props }: TextProps) {
  const fontStyle = petFlowFontsReady
    ? { fontFamily: fontFamilyForStyle(style) }
    : null;
  return <NativeText {...props} style={[style, fontStyle]} />;
}

function TextInput({ style, ...props }: TextInputProps) {
  const fontStyle = petFlowFontsReady
    ? { fontFamily: fontFamilyForStyle(style) }
    : null;
  return <NativeTextInput {...props} style={[style, fontStyle]} />;
}

export default function App() {
  const [fontsLoaded, fontLoadError] = useFonts(petFlowFontAssets);
  const configured = isSupabaseConfigured();
  petFlowFontsReady = fontsLoaded && !fontLoadError;
  const oauthSessionActiveRef = useRef(false);

  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [mainSection, setMainSection] = useState<MainSection>("home");
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [linkOauthLoading, setLinkOauthLoading] =
    useState<OAuthProvider | null>(null);
  const [linkOauthMessage, setLinkOauthMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [draft, setDraft] = useState<TesterDraft>(emptyDraft);
  const [user, setUser] = useState<User | null>(null);
  const [testerProfile, setTesterProfile] = useState<TesterProfile | null>(null);
  const [pets, setPets] = useState<PetProfile[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string>();
  const [petDraft, setPetDraft] = useState<PetDraft>(emptyPetDraft);
  const [petFormExpanded, setPetFormExpanded] = useState(false);
  const [editingPetId, setEditingPetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [petLoading, setPetLoading] = useState(false);
  const [petMessage, setPetMessage] = useState("");
  const [healthInput, setHealthInput] = useState<HealthCheckInput | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthMessage, setHealthMessage] = useState("");
  const [latestResult, setLatestResult] = useState<AnalysisResult | null>(null);
  const [latestEpisodeId, setLatestEpisodeId] = useState<string | null>(null);
  const [editingHealthRecord, setEditingHealthRecord] =
    useState<HistoryRecord | null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [episodes, setEpisodes] = useState<PetEpisode[]>([]);
  const [plans, setPlans] = useState<EpisodePlan[]>([]);
  const [progress, setProgress] = useState<EpisodeProgress[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMessage, setHistoryMessage] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [editingPlanEpisodeId, setEditingPlanEpisodeId] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState("");
  const [planSavingEpisodeId, setPlanSavingEpisodeId] = useState<string | null>(null);
  const [planTogglingTaskId, setPlanTogglingTaskId] = useState<string | null>(null);
  const [planNotice, setPlanNotice] = useState<EpisodeNotice>({
    episodeId: null,
    text: "",
    tone: "success",
  });
  const [progressDraft, setProgressDraft] = useState<ProgressDraft | null>(null);
  const [progressSavingKey, setProgressSavingKey] = useState<string | null>(null);
  const [progressNotice, setProgressNotice] = useState<EpisodeNotice>({
    episodeId: null,
    text: "",
    tone: "success",
  });
  const [aiAccess, setAiAccess] = useState<AiAccessStatus | null>(null);
  const [aiCodeDraft, setAiCodeDraft] = useState("");
  const [aiCodeLoading, setAiCodeLoading] = useState(false);
  const [aiCodeMessage, setAiCodeMessage] = useState("");
  const [accountDeletionLoading, setAccountDeletionLoading] = useState(false);
  const [accountDeletionMessage, setAccountDeletionMessage] = useState("");
  const [accountDeletionRequested, setAccountDeletionRequested] = useState(false);
  const [vetDrafts, setVetDrafts] = useState<VetDraftMap>({});
  const [vetDraftLoadingEpisodeId, setVetDraftLoadingEpisodeId] =
    useState<string | null>(null);
  const [vetDraftNotice, setVetDraftNotice] = useState<EpisodeNotice>({
    episodeId: null,
    text: "",
    tone: "success",
  });
  const [aiFeedbackDrafts, setAiFeedbackDrafts] = useState<AiFeedbackDraftMap>({});
  const [aiFeedbackSavingUsageId, setAiFeedbackSavingUsageId] =
    useState<string | null>(null);
  const [aiFeedbackNotice, setAiFeedbackNotice] = useState<EpisodeNotice>({
    episodeId: null,
    text: "",
    tone: "success",
  });
  const [savedAiFeedbackUsageIds, setSavedAiFeedbackUsageIds] = useState<string[]>([]);

  const resetAiFeedbackState = useCallback(() => {
    setAiFeedbackDrafts({});
    setAiFeedbackSavingUsageId(null);
    setAiFeedbackNotice({ episodeId: null, text: "", tone: "success" });
    setSavedAiFeedbackUsageIds([]);
  }, []);

  const [pendingMedia, setPendingMedia] = useState<PendingMediaAsset[]>([]);
  const [mediaMessage, setMediaMessage] = useState("");
  const [mediaUploadMessage, setMediaUploadMessage] = useState("");
  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === selectedPetId),
    [pets, selectedPetId],
  );
  const selectedPetHistory = useMemo(
    () =>
      sortHistory(
        history.filter((record) => record.petId && record.petId === selectedPetId),
      ),
    [history, selectedPetId],
  );
  const healthFlow = useMemo(
    () => summarizeHealthFlow(selectedPetHistory, selectedPet?.name),
    [selectedPet?.name, selectedPetHistory],
  );
  const episodeReportGroups = useMemo<EpisodeReportGroup[]>(() => {
    const episodeById = new Map(
      episodes
        .filter((episode) => episode.petId === selectedPetId)
        .map((episode) => [episode.id, episode]),
    );
    const planByEpisode = new Map(plans.map((plan) => [plan.episodeId, plan]));
    const progressByEpisode = new Map<string, EpisodeProgress[]>();
    for (const item of progress) {
      const items = progressByEpisode.get(item.episodeId) ?? [];
      items.push(item);
      progressByEpisode.set(item.episodeId, items);
    }
    const grouped = new Map<
      string,
      { episode?: PetEpisode; records: HistoryRecord[] }
    >();

    for (const record of selectedPetHistory) {
      const key = record.episodeId ?? `record:${record.result.id}`;
      const group = grouped.get(key) ?? {
        episode: record.episodeId ? episodeById.get(record.episodeId) : undefined,
        records: [],
      };
      group.records.push(record);
      grouped.set(key, group);
    }

    return [...grouped.entries()]
      .map(([key, group]) => {
        const episodeProgress = group.episode
          ? progressByEpisode.get(group.episode.id) ?? []
          : [];
        const plan = group.episode ? planByEpisode.get(group.episode.id) : undefined;
        const report = buildEpisodeReport(
          group.records,
          selectedPet?.name,
          plan,
          episodeProgress,
        );
        return {
          key,
          episode: group.episode,
          records: group.records,
          plan,
          progress: episodeProgress,
          report,
          latestAt:
            group.episode?.lastActivityAt ??
            group.records[0]?.result.createdAt ??
            "",
        };
      })
      .sort((a, b) => {
        if (a.episode?.status !== b.episode?.status) {
          return a.episode?.status === "open" ? -1 : 1;
        }
        return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();
      });
  }, [episodes, plans, progress, selectedPet?.name, selectedPetHistory, selectedPetId]);

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
    if (mainSection === "record") return "오늘의 건강 기록";
    if (mainSection === "reports") return "기록과 보고서";
    if (mainSection === "account") return "내 계정";
    return `${selectedPet?.name ?? "반려동물"}와 좋은 하루 보내고 있나요?`;
  }, [
    authReady,
    configured,
    mainSection,
    needsTesterProfile,
    pets.length,
    selectedPet?.name,
    user,
  ]);

  const loadAccount = useCallback(async (nextUser: User | null) => {
    setUser(nextUser);
    setMessage("");
    setPetMessage("");
    if (!nextUser) {
      setMainSection("home");
      setTesterProfile(null);
      setDraft(emptyDraft);
      setPets([]);
      setSelectedPetId(undefined);
      setPetDraft(emptyPetDraft);
      setPetFormExpanded(false);
      setEditingPetId(null);
      setHealthInput(null);
      setLatestResult(null);
      setLatestEpisodeId(null);
      setEditingHealthRecord(null);
      setHistory([]);
      setEpisodes([]);
      setPlans([]);
      setProgress([]);
      setHistoryMessage("");
      setShareMessage("");
      setEditingPlanEpisodeId(null);
      setPlanDraft("");
      setPlanSavingEpisodeId(null);
      setPlanTogglingTaskId(null);
      setPlanNotice({ episodeId: null, text: "", tone: "success" });
      setProgressDraft(null);
      setProgressSavingKey(null);
      setProgressNotice({ episodeId: null, text: "", tone: "success" });
      setAiAccess(null);
      setAiCodeDraft("");
      setAiCodeLoading(false);
      setAiCodeMessage("");
      setAccountDeletionLoading(false);
      setAccountDeletionMessage("");
      setAccountDeletionRequested(false);
      setVetDrafts({});
      setVetDraftLoadingEpisodeId(null);
      setVetDraftNotice({ episodeId: null, text: "", tone: "success" });
      resetAiFeedbackState();
      setPendingMedia([]);
      setMediaMessage("");
      setMediaUploadMessage("");
      setAuthReady(true);
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    setAccountDeletionLoading(false);
    setAccountDeletionMessage("");
    setAccountDeletionRequested(false);

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
    setPetFormExpanded(!loadedPets.length);
    if (!loadedPets.length) {
      setMainSection("home");
      setPetDraft(emptyPetDraft);
      setEditingPetId(null);
      setHealthInput(null);
      setLatestResult(null);
      setLatestEpisodeId(null);
      setEditingHealthRecord(null);
      setHistory([]);
      setEpisodes([]);
      setPlans([]);
      setProgress([]);
      setHistoryMessage("");
      setShareMessage("");
      setEditingPlanEpisodeId(null);
      setPlanDraft("");
      setPlanSavingEpisodeId(null);
      setPlanTogglingTaskId(null);
      setPlanNotice({ episodeId: null, text: "", tone: "success" });
      setProgressDraft(null);
      setProgressSavingKey(null);
      setProgressNotice({ episodeId: null, text: "", tone: "success" });
      setVetDrafts({});
      setVetDraftLoadingEpisodeId(null);
      setVetDraftNotice({ episodeId: null, text: "", tone: "success" });
      resetAiFeedbackState();
      setPendingMedia([]);
      setMediaMessage("");
      setMediaUploadMessage("");
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
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      setAiAccess(
        sessionData.session?.access_token
          ? await fetchAiAccessStatus(sessionData.session.access_token)
          : null,
      );
    } catch {
      setAiAccess(null);
    }
    setAuthReady(true);
  }, [resetAiFeedbackState]);

  const loadPetHistory = useCallback(async (pet: PetProfile) => {
    const petId = pet.id;
    if (!petId) return;
    setHistoryLoading(true);
    setHistoryMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const session = data.session;
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("missing session");

      const response = await fetch(`${apiBaseUrl}/api/pets/${petId}/history`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("history failed");
      const payload = (await response.json()) as {
        episodes?: PetEpisode[];
        plans?: EpisodePlan[];
        progress?: EpisodeProgress[];
        reports?: DisplayHealthReport[];
      };
      const remoteRecords = (payload.reports ?? []).map((report) =>
        storedReportToHistoryRecord(report, pet),
      );
      setHistory((current) => mergePetHistory(current, remoteRecords, petId));
      setEpisodes(payload.episodes ?? []);
      setPlans(payload.plans ?? []);
      setProgress(payload.progress ?? []);
    } catch {
      setHistoryMessage("최근 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  async function uploadPendingMediaFiles({
    accessToken,
    clientId,
    files,
    petId,
    reportId,
    userId,
  }: {
    accessToken: string;
    clientId: string;
    files: PendingMediaAsset[];
    petId: string;
    reportId: string;
    userId: string;
  }): Promise<ReportMediaAttachment[]> {
    const supabase = getSupabaseClient();
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
        const uploadFile = new File(item.uri);
        const body = await uploadFile.arrayBuffer();
        if (body.byteLength <= 0 || body.byteLength > maxReportMediaSizeBytes) {
          throw new Error("invalid media size");
        }
        const extension = reportMediaExtensionFromMimeType(item.mimeType);
        const storagePath = `${userId}/${petId}/${reportId}/${Date.now()}-${index}-${createUuid()}.${extension}`;

        const { error } = await supabase.storage
          .from(reportMediaBucket)
          .upload(storagePath, body, {
            cacheControl: "3600",
            contentType: item.mimeType,
            upsert: false,
          });
        if (error) throw error;
        uploadedPaths.push(storagePath);
        registeredFiles.push({
          storagePath,
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: body.byteLength || item.sizeBytes,
          kind: item.kind,
        });
      }

      const response = await fetch(`${apiBaseUrl}/api/reports/${reportId}/media`, {
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

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;
    const authClient = supabase.auth;

    async function exchangeAuthUrl(url: string | null) {
      if (!url || !url.startsWith("petflow://auth-callback")) return;
      if (oauthSessionActiveRef.current) return;

      const { error } = await authClient.exchangeCodeForSession(url);
      if (error) {
        setMessage("이메일 인증 링크를 처리하지 못했어요. 다시 로그인해 주세요.");
      }
    }

    void Linking.getInitialURL().then(exchangeAuthUrl);
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void exchangeAuthUrl(url);
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!selectedPet) return;
    setHealthInput(profileToHealthInput(selectedPet));
    setHealthMessage("");
    setLatestResult(null);
    setLatestEpisodeId(null);
    setEditingHealthRecord(null);
    setEpisodes([]);
    setPlans([]);
    setProgress([]);
    setShareMessage("");
    setEditingPlanEpisodeId(null);
    setPlanDraft("");
    setPlanSavingEpisodeId(null);
    setPlanTogglingTaskId(null);
    setPlanNotice({ episodeId: null, text: "", tone: "success" });
    setProgressDraft(null);
    setProgressSavingKey(null);
    setProgressNotice({ episodeId: null, text: "", tone: "success" });
    setVetDrafts({});
    setVetDraftLoadingEpisodeId(null);
    setVetDraftNotice({ episodeId: null, text: "", tone: "success" });
    resetAiFeedbackState();
    setPendingMedia([]);
    setMediaMessage("");
    setMediaUploadMessage("");
    void loadPetHistory(selectedPet);
  }, [loadPetHistory, resetAiFeedbackState, selectedPet]);

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
    if (!emailPattern.test(email.trim())) {
      setMessage("이메일 형식을 확인해 주세요.");
      return;
    }
    if (authMode === "login" && !password) {
      setMessage("비밀번호를 입력해 주세요.");
      return;
    }
    if (authMode === "signup" && !isStrongPassword(password)) {
      setMessage("비밀번호 조건을 모두 충족해 주세요.");
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
        ? await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              emailRedirectTo: "petflow://auth-callback",
            },
          })
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

  async function submitOAuth(provider: OAuthProvider) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setMessage("Supabase 공개 환경변수를 먼저 설정해 주세요.");
      return;
    }

    setOauthLoading(provider);
    setMessage("");
    oauthSessionActiveRef.current = true;

    try {
      const redirectTo = "petflow://auth-callback";
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error || !data.url) {
        throw error ?? new Error("OAuth URL was not created.");
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === "success") {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          result.url,
        );
        if (exchangeError) throw exchangeError;
        setMessage("");
        return;
      }

      if (result.type !== "cancel" && result.type !== "dismiss") {
        setMessage(`${oauthProviderLabels[provider]} 로그인이 완료되지 않았어요.`);
      }
    } catch {
      setMessage(
        `${oauthProviderLabels[provider]} 로그인 설정을 확인해 주세요. Supabase Provider와 Redirect URL이 필요해요.`,
      );
    } finally {
      oauthSessionActiveRef.current = false;
      setOauthLoading(null);
    }
  }

  async function linkOAuthIdentity(provider: OAuthProvider) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLinkOauthMessage("Supabase 공개 환경변수를 먼저 설정해 주세요.");
      return;
    }

    setLinkOauthLoading(provider);
    setLinkOauthMessage("");
    oauthSessionActiveRef.current = true;

    try {
      const redirectTo = "petflow://auth-callback";
      const { data, error } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error || !data.url) {
        throw error ?? new Error("OAuth link URL was not created.");
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === "success") {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          result.url,
        );
        if (exchangeError) throw exchangeError;
        setLinkOauthMessage(`${oauthProviderLabels[provider]} 계정을 연결했어요.`);
        return;
      }

      if (result.type !== "cancel" && result.type !== "dismiss") {
        setLinkOauthMessage(`${oauthProviderLabels[provider]} 연결이 완료되지 않았어요.`);
      }
    } catch (error) {
      setLinkOauthMessage(oauthLinkErrorMessage(provider, error));
    } finally {
      oauthSessionActiveRef.current = false;
      setLinkOauthLoading(null);
    }
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

  async function requestAccountDeletion() {
    if (accountDeletionRequested) return;

    setAccountDeletionLoading(true);
    setAccountDeletionMessage("");
    try {
      const supabase = getSupabaseClient();
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("missing session");

      const response = await fetch(`${apiBaseUrl}/api/account-deletion`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("request failed");

      setAccountDeletionRequested(true);
      setAccountDeletionMessage(
        "계정 삭제 요청을 접수했어요. 운영자가 확인 후 테스트 데이터 삭제를 진행합니다.",
      );
    } catch {
      setAccountDeletionMessage(
        "계정 삭제 요청을 접수하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setAccountDeletionLoading(false);
    }
  }

  function startNewPet() {
    setEditingPetId(null);
    setPetDraft(emptyPetDraft);
    setPetFormExpanded(true);
    setPetMessage("");
  }

  function startEditingPet(pet: PetProfile) {
    setEditingPetId(pet.id ?? null);
    setPetFormExpanded(true);
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

  function closePetForm() {
    setEditingPetId(null);
    setPetDraft(emptyPetDraft);
    setPetFormExpanded(false);
    setPetMessage("");
  }

  async function pickMedia() {
    setMediaMessage("");
    if (editingHealthRecord) {
      setMediaMessage("첨부 변경은 새 기록에서 다시 추가해 주세요.");
      return;
    }
    if (pendingMedia.length >= maxReportMediaFiles) {
      setMediaMessage(`사진·영상은 한 기록에 ${maxReportMediaFiles}개까지만 저장할 수 있어요.`);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMediaMessage("사진·영상 접근 권한이 필요해요. 권한을 허용한 뒤 다시 시도해 주세요.");
      return;
    }

    const remaining = maxReportMediaFiles - pendingMedia.length;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images", "videos"],
      quality: 0.8,
      selectionLimit: remaining,
    });
    if (result.canceled) return;

    const next: PendingMediaAsset[] = [];
    let nextMessage = "";
    for (const asset of result.assets) {
      if (pendingMedia.length + next.length >= maxReportMediaFiles) {
        nextMessage = `사진·영상은 한 기록에 ${maxReportMediaFiles}개까지만 저장할 수 있어요.`;
        break;
      }
      const mimeType = mimeTypeFromAsset(asset);
      const kind = reportMediaKindFromMimeType(mimeType);
      if (!kind) {
        nextMessage =
          "JPG, PNG, WEBP, HEIC 이미지 또는 MP4, MOV, WEBM 영상만 저장할 수 있어요.";
        continue;
      }
      const sizeBytes = asset.fileSize ?? 0;
      if (sizeBytes > maxReportMediaSizeBytes) {
        nextMessage = "파일 하나는 50MB 이하로 올려 주세요.";
        continue;
      }
      next.push({
        id: createUuid(),
        uri: asset.uri,
        fileName: fileNameFromAsset(asset, mimeType),
        mimeType,
        sizeBytes,
        kind,
      });
    }

    setMediaMessage(nextMessage);
    if (next.length) setPendingMedia((current) => [...current, ...next]);
  }

  function removePendingMedia(id: string) {
    setPendingMedia((current) => current.filter((item) => item.id !== id));
    setMediaMessage("");
  }

  function startHealthRecord() {
    if (selectedPet) {
      setHealthInput(profileToHealthInput(selectedPet));
    }
    setEditingHealthRecord(null);
    setLatestResult(null);
    setLatestEpisodeId(null);
    setHealthMessage("");
    setMediaMessage("");
    setMediaUploadMessage("");
    setPendingMedia([]);
    setMainSection("record");
  }

  function startEditingHealthRecord(record: HistoryRecord) {
    if (!selectedPet) return;
    setEditingHealthRecord(record);
    setHealthInput({
      ...record.input,
      petName: selectedPet.name,
      species: selectedPet.species,
      breed: selectedPet.breed || undefined,
      birthDate: selectedPet.birthDate || undefined,
      sex: selectedPet.sex,
      weight: selectedPet.weight || undefined,
    });
    setLatestResult(record.result);
    setLatestEpisodeId(record.episodeId ?? null);
    setHealthMessage("수정할 부분만 바꾼 뒤 저장해 주세요.");
    setMediaMessage("");
    setMediaUploadMessage("");
    setPendingMedia([]);
    setMainSection("record");
  }

  async function deleteHealthRecord(record: HistoryRecord) {
    try {
      if (record.result.storage === "remote") {
        const supabase = getSupabaseClient();
        const { data } = supabase
          ? await supabase.auth.getSession()
          : { data: { session: null } };
        const accessToken = data.session?.access_token;
        if (!accessToken) throw new Error("missing session");
        const response = await fetch(`${apiBaseUrl}/api/reports/${record.result.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error("delete failed");
      }

      setHistory((current) =>
        current.filter((item) => item.result.id !== record.result.id),
      );
      if (latestResult?.id === record.result.id) {
        setLatestResult(null);
        setLatestEpisodeId(null);
      }
      if (editingHealthRecord?.result.id === record.result.id) {
        setEditingHealthRecord(null);
      }
      setHistoryMessage("기록을 삭제했어요.");
    } catch {
      setHistoryMessage("기록을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  function confirmDeleteHealthRecord(record: HistoryRecord) {
    Alert.alert(
      "기록을 삭제할까요?",
      "삭제하면 병원 공유 요약에서도 빠져요.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () => void deleteHealthRecord(record),
        },
      ],
    );
  }

  function changeMainSection(next: MainSection) {
    if (next === "record" && mainSection !== "record") {
      startHealthRecord();
      return;
    }
    setMainSection(next);
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
    setPetFormExpanded(false);
    setPetMessage("반려동물 정보가 저장됐어요.");
  }

  async function submitHealthCheck() {
    if (!selectedPet?.id || !healthInput) {
      setHealthMessage("오늘 기록할 반려동물을 먼저 선택해 주세요.");
      return;
    }
    const petId = selectedPet.id;

    const input: HealthCheckInput = {
      ...healthInput,
      petName: selectedPet.name,
      species: selectedPet.species,
      breed: selectedPet.breed || undefined,
      birthDate: selectedPet.birthDate || undefined,
      sex: selectedPet.sex,
      weight: selectedPet.weight || undefined,
    };
    const localResult = analyzeLocally(input);
    setHealthLoading(true);
    setHealthMessage("");
    setMediaUploadMessage("");
    setLatestEpisodeId(null);

    try {
      const supabase = getSupabaseClient();
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const session = data.session;
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("missing session");
      if (editingHealthRecord) {
        let media = editingHealthRecord.media ?? [];
        let petIdForRecord = editingHealthRecord.petId ?? petId;
        let episodeId = editingHealthRecord.episodeId;
        let result: AnalysisResult;

        if (editingHealthRecord.result.storage === "remote") {
          const response = await fetch(
            `${apiBaseUrl}/api/reports/${editingHealthRecord.result.id}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(input),
            },
          );
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
          petIdForRecord = savedPetId ?? petIdForRecord;
          episodeId = savedEpisodeId ?? undefined;
        } else {
          result = {
            ...localResult,
            id: editingHealthRecord.result.id,
            createdAt: editingHealthRecord.result.createdAt,
            storage: editingHealthRecord.result.storage ?? "local",
          };
        }

        const record: HistoryRecord = {
          ...editingHealthRecord,
          petId: petIdForRecord,
          episodeId,
          input,
          result,
          media,
        };
        setLatestResult(result);
        setLatestEpisodeId(episodeId ?? null);
        setHistory((current) => upsertHistoryRecord(current, record));
        setEditingHealthRecord(null);
        setPendingMedia([]);
        setMediaUploadMessage("");
        setHealthMessage("기록을 수정했어요.");
        return;
      }
      const clientId = createUuid();

      const response = await fetch(`${apiBaseUrl}/api/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "x-petflow-client-id": clientId,
          "x-petflow-pet-id": petId,
        },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error("analysis failed");
      const payload = (await response.json()) as AnalysisResult & {
        episodeId?: string | null;
      };
      const { episodeId, ...result } = payload;
      let media: ReportMediaAttachment[] = [];
      let mediaNotice = "";
      if (pendingMedia.length) {
        if (
          result.storage === "remote" &&
          episodeId &&
          session.user.id &&
          petId
        ) {
          try {
            media = await uploadPendingMediaFiles({
              accessToken,
              clientId,
              files: pendingMedia,
              petId,
              reportId: result.id,
              userId: session.user.id,
            });
            mediaNotice = media.length
              ? `${formatReportMediaSummary(media)} 첨부도 함께 저장됐어요.`
              : "";
          } catch {
            mediaNotice =
              "기록은 저장됐지만 사진·영상 첨부는 저장하지 못했어요. 필요하면 새 기록에서 다시 첨부해 주세요.";
          }
        } else {
          mediaNotice =
            "기록은 저장됐지만 사진·영상은 계정에 연결된 서버 기록에서만 저장할 수 있어요.";
        }
      }
      const record: HistoryRecord = {
        petId,
        episodeId: episodeId ?? undefined,
        input,
        result,
        media,
      };
      setLatestResult(result);
      setLatestEpisodeId(episodeId ?? null);
      setHistory((current) => upsertHistoryRecord(current, record));
      if (episodeId) {
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
              petId,
              status: "open",
              startedAt: result.createdAt,
              lastActivityAt: result.createdAt,
              closedAt: null,
            },
            ...current,
          ];
        });
      }
      setPendingMedia([]);
      setMediaUploadMessage(mediaNotice);
      setHealthMessage(
        result.storage === "remote"
          ? "오늘 기록이 저장됐어요."
          : "결과는 만들었지만 서버 저장은 확인하지 못했어요.",
      );
    } catch {
      if (editingHealthRecord) {
        setHealthMessage("기록을 수정하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.");
      } else {
        const fallbackResult: AnalysisResult = { ...localResult, storage: "local" };
        setLatestResult(fallbackResult);
        setHistory((current) =>
          upsertHistoryRecord(current, {
            petId: selectedPet.id,
            input,
            result: fallbackResult,
          }),
        );
        setHealthMessage(
          "서버 저장은 실패했지만, 기기에서 기본 안전 분류를 만들었어요. 네트워크를 확인한 뒤 다시 저장해 주세요.",
        );
      }
    } finally {
      setHealthLoading(false);
    }
  }

  async function shareEpisodeReport(report: EpisodeReport) {
    setShareMessage("");
    try {
      await Share.share({
        title: report.title,
        message: report.shareText,
      });
      setShareMessage("병원 전달 요약을 공유했어요.");
    } catch {
      setShareMessage("공유 창을 열지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  function startPlanEdit(group: EpisodeReportGroup) {
    if (!group.episode) return;
    setEditingPlanEpisodeId(group.episode.id);
    setPlanDraft(group.plan?.tasks.map((task) => task.text).join("\n") ?? "");
    setPlanNotice({ episodeId: group.episode.id, text: "", tone: "success" });
  }

  function cancelPlanEdit() {
    setEditingPlanEpisodeId(null);
    setPlanDraft("");
  }

  async function saveEpisodePlan(episodeId: string) {
    const tasks = planDraft
      .split(/\r?\n/)
      .map((task) => task.trim())
      .filter(Boolean);

    if (!tasks.length) {
      setPlanNotice({
        episodeId,
        text: "병원에서 받은 안내를 한 줄 이상 적어 주세요.",
        tone: "error",
      });
      return;
    }
    if (tasks.length > 5) {
      setPlanNotice({
        episodeId,
        text: "체크리스트는 최대 5개까지만 저장할 수 있어요.",
        tone: "error",
      });
      return;
    }
    if (tasks.some((task) => task.length > 160)) {
      setPlanNotice({
        episodeId,
        text: "각 항목은 160자 이내로 짧게 적어 주세요.",
        tone: "error",
      });
      return;
    }

    setPlanSavingEpisodeId(episodeId);
    setPlanNotice({ episodeId, text: "", tone: "success" });
    try {
      const supabase = getSupabaseClient();
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("missing session");

      const response = await fetch(`${apiBaseUrl}/api/episodes/${episodeId}/plan`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tasks }),
      });
      if (!response.ok) throw new Error("save plan failed");
      const payload = (await response.json()) as { plan: EpisodePlan };

      setPlans((current) => [
        payload.plan,
        ...current.filter((plan) => plan.episodeId !== payload.plan.episodeId),
      ]);
      setEditingPlanEpisodeId(null);
      setPlanDraft("");
      setPlanNotice({
        episodeId,
        text: "병원에서 받은 안내를 저장했어요.",
        tone: "success",
      });
    } catch {
      setPlanNotice({
        episodeId,
        text: "병원에서 받은 안내를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
        tone: "error",
      });
    } finally {
      setPlanSavingEpisodeId(null);
    }
  }

  async function toggleEpisodePlanTask(
    episodeId: string,
    taskId: string,
    completed: boolean,
  ) {
    setPlanTogglingTaskId(taskId);
    setPlanNotice({ episodeId, text: "", tone: "success" });
    try {
      const supabase = getSupabaseClient();
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("missing session");

      const response = await fetch(`${apiBaseUrl}/api/episodes/${episodeId}/plan`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskId, completed }),
      });
      if (!response.ok) throw new Error("toggle plan task failed");

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
      setPlanNotice({
        episodeId,
        text: completed ? "체크 완료로 표시했어요." : "체크를 해제했어요.",
        tone: "success",
      });
    } catch {
      setPlanNotice({
        episodeId,
        text: "체크 상태를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
        tone: "error",
      });
    } finally {
      setPlanTogglingTaskId(null);
    }
  }

  function startProgressEdit(group: EpisodeReportGroup, day: FollowUpDay) {
    if (!group.episode) return;
    const saved = group.progress.find((item) => item.followUpDay === day);
    setProgressDraft({
      episodeId: group.episode.id,
      followUpDay: day,
      conditionChange: saved?.conditionChange ?? "same",
      appetite: saved?.appetite ?? "normal",
      energy: saved?.energy ?? "normal",
    });
    setProgressNotice({ episodeId: group.episode.id, text: "", tone: "success" });
  }

  function cancelProgressEdit() {
    setProgressDraft(null);
  }

  async function saveEpisodeProgress() {
    if (!progressDraft) return;
    const { episodeId, ...input } = progressDraft;
    const savingKey = `${episodeId}:${input.followUpDay}`;

    setProgressSavingKey(savingKey);
    setProgressNotice({ episodeId, text: "", tone: "success" });
    try {
      const supabase = getSupabaseClient();
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("missing session");

      const response = await fetch(`${apiBaseUrl}/api/episodes/${episodeId}/progress`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error("save progress failed");
      const payload = (await response.json()) as { progress: EpisodeProgress };

      setProgress((current) => {
        const next = [
          ...current.filter(
            (item) =>
              item.id !== payload.progress.id &&
              !(
                item.episodeId === payload.progress.episodeId &&
                item.followUpDay === payload.progress.followUpDay
              ),
          ),
          payload.progress,
        ];
        return next.sort((a, b) => a.followUpDay - b.followUpDay);
      });
      setEpisodes((current) =>
        current.map((episode) =>
          episode.id === episodeId
            ? { ...episode, lastActivityAt: payload.progress.recordedAt }
            : episode,
        ),
      );
      setProgressDraft(null);
      setProgressNotice({
        episodeId,
        text: `${input.followUpDay}일 경과를 저장했어요.`,
        tone: "success",
      });
    } catch {
      setProgressNotice({
        episodeId,
        text: "경과 기록을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
        tone: "error",
      });
    } finally {
      setProgressSavingKey(null);
    }
  }

  async function redeemAiCode() {
    const code = aiCodeDraft.trim();
    if (!code) {
      setAiCodeMessage("관리자에게 받은 테스터 키를 입력해 주세요.");
      return;
    }

    setAiCodeLoading(true);
    setAiCodeMessage("");
    try {
      const supabase = getSupabaseClient();
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("missing session");

      const response = await fetch(`${apiBaseUrl}/api/ai-access`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });
      const payload = (await response.json()) as {
        access?: AiAccessStatus;
        error?: string;
      };
      if (!response.ok || !payload.access) {
        throw new Error(payload.error ?? "invalid code");
      }

      setAiAccess(payload.access);
      setAiCodeDraft("");
      setAiCodeMessage("테스터 키가 등록됐어요.");
    } catch {
      setAiCodeMessage("테스터 키를 등록하지 못했어요. 코드와 사용 가능 여부를 확인해 주세요.");
    } finally {
      setAiCodeLoading(false);
    }
  }

  async function createVetDraft(episodeId: string) {
    if (!aiAccess?.enabled) {
      setVetDraftNotice({
        episodeId,
        text: "테스터 키를 등록한 계정만 GPT 초안을 만들 수 있어요.",
        tone: "error",
      });
      return;
    }

    setVetDraftLoadingEpisodeId(episodeId);
    setVetDraftNotice({ episodeId, text: "", tone: "success" });
    try {
      const supabase = getSupabaseClient();
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("missing session");

      const response = await fetch(
        `${apiBaseUrl}/api/episodes/${episodeId}/vet-draft`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const payload = (await response.json()) as {
        draft?: VetReviewDraft;
        access?: AiAccessStatus;
        error?: string;
      };
      if (payload.access) setAiAccess(payload.access);
      if (!response.ok || !payload.draft) {
        throw new Error(payload.error ?? "draft failed");
      }
      const nextDraft = payload.draft;

      setVetDrafts((current) => ({ ...current, [episodeId]: nextDraft }));
      setVetDraftNotice({
        episodeId,
        text: "수의사 검토용 GPT 초안을 만들었어요.",
        tone: "success",
      });
      const nextAccess = await fetchAiAccessStatus(accessToken);
      if (nextAccess) setAiAccess(nextAccess);
    } catch {
      setVetDraftNotice({
        episodeId,
        text: "GPT 초안을 만들지 못했어요. 테스터 키 사용량과 관리자 설정을 확인해 주세요.",
        tone: "error",
      });
    } finally {
      setVetDraftLoadingEpisodeId(null);
    }
  }

  async function shareVetDraft(episodeId: string, draft: VetReviewDraft) {
    try {
      await Share.share({ title: draft.title, message: draft.copyText });
      setVetDraftNotice({
        episodeId,
        text: "GPT 초안을 공유했어요.",
        tone: "success",
      });
    } catch {
      setVetDraftNotice({
        episodeId,
        text: "GPT 초안 공유 창을 열지 못했어요.",
        tone: "error",
      });
    }
  }

  function updateAiFeedbackDraft(
    usageId: string,
    patch: Partial<AiFeedbackDraft>,
  ) {
    setAiFeedbackDrafts((current) => ({
      ...current,
      [usageId]: {
        ...(current[usageId] ?? defaultAiFeedbackDraft),
        ...patch,
      },
    }));
    setAiFeedbackNotice({ episodeId: null, text: "", tone: "success" });
  }

  async function saveAiFeedback(episodeId: string, draft: VetReviewDraft) {
    const usageId = draft.usageId;
    if (!usageId) return;

    const feedback = aiFeedbackDrafts[usageId] ?? defaultAiFeedbackDraft;
    const price = feedback.price.trim()
      ? Number(feedback.price.replace(/[^0-9]/g, ""))
      : null;

    setAiFeedbackSavingUsageId(usageId);
    setAiFeedbackNotice({ episodeId, text: "", tone: "success" });
    try {
      const supabase = getSupabaseClient();
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("missing session");

      const response = await fetch(`${apiBaseUrl}/api/ai-report-feedback`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          usageId,
          episodeId,
          usefulnessScore: feedback.usefulnessScore,
          wouldPay: feedback.wouldPay,
          willingnessToPayKrw:
            price !== null && Number.isFinite(price) ? price : null,
          comment: feedback.comment.trim() || undefined,
        } satisfies AiReportFeedbackInput),
      });
      if (!response.ok) throw new Error("save feedback failed");

      setSavedAiFeedbackUsageIds((current) =>
        current.includes(usageId) ? current : [...current, usageId],
      );
      setAiFeedbackNotice({
        episodeId,
        text: "GPT 초안 피드백을 저장했어요.",
        tone: "success",
      });
    } catch {
      setAiFeedbackNotice({
        episodeId,
        text: "피드백을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
        tone: "error",
      });
    } finally {
      setAiFeedbackSavingUsageId(null);
    }
  }

  const appDescription =
    user && !needsTesterProfile
      ? mainSectionDescriptions[mainSection]
      : "로그인 세션을 앱에 저장하고, 테스터 필수 정보를 웹과 같은 DB 구조로 관리하는 단계예요.";

  const accountCard = user ? (
    <AccountCard
      aiAccess={aiAccess}
      aiCodeDraft={aiCodeDraft}
      aiCodeLoading={aiCodeLoading}
      aiCodeMessage={aiCodeMessage}
      accountDeletionLoading={accountDeletionLoading}
      accountDeletionMessage={accountDeletionMessage}
      accountDeletionRequested={accountDeletionRequested}
      user={user}
      testerProfile={testerProfile}
      linkOauthLoading={linkOauthLoading}
      linkOauthMessage={linkOauthMessage}
      onSignOut={signOut}
      onChangeAiCode={setAiCodeDraft}
      onLinkOAuth={linkOAuthIdentity}
      onRedeemAiCode={redeemAiCode}
      onRequestAccountDeletion={requestAccountDeletion}
      disabled={loading}
    />
  ) : null;

  if (!fontsLoaded && !fontLoadError) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.fontLoading}>
          <ActivityIndicator color={colors.green} />
          <NativeText style={styles.fontLoadingText}>PetFlow 준비 중</NativeText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setMainSection("home")}
            style={styles.appBrand}
            accessibilityRole="button"
            accessibilityLabel="홈으로 이동"
          >
            <AppBrandMark />
            <View>
              <Text style={styles.badgeText}>PETFLOW</Text>
              <Text style={styles.brandTagline}>관찰을 병원 준비로</Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.title}>{headline}</Text>
          <Text style={styles.description}>{appDescription}</Text>

          {!configured ? (
            <ConfigurationCard />
          ) : !authReady ? (
            <LoadingCard />
          ) : user ? (
            <>
              {needsTesterProfile ? (
                <>
                  {accountCard}
                  <TesterProfileForm
                    draft={draft}
                    setDraft={setDraft}
                    loading={loading}
                    message={message}
                    onSubmit={submitTesterProfile}
                  />
                </>
              ) : (
                <>
                  <MainSectionTabs value={mainSection} onChange={changeMainSection} />
                  {mainSection === "home" ? (
                    <HomeDashboard
                      flow={healthFlow}
                      history={selectedPetHistory}
                      latestResult={latestResult}
                      pets={pets}
                      selectedPet={selectedPet}
                      onGoAccount={() => setMainSection("account")}
                      onGoRecord={startHealthRecord}
                      onGoReports={() => setMainSection("reports")}
                    />
                  ) : null}
                  {mainSection === "record" ? (
                    <>
                      <PetManager
                        draft={petDraft}
                        editingPetId={editingPetId}
                        formExpanded={petFormExpanded}
                        loading={petLoading}
                        message={petMessage}
                        pets={pets}
                        selectedPetId={selectedPetId}
                        setDraft={setPetDraft}
                        onCancelForm={closePetForm}
                        onEdit={startEditingPet}
                        onNew={startNewPet}
                        onSave={savePetProfile}
                        onSelect={setSelectedPetId}
                      />
                      {selectedPet && healthInput ? (
                        <HealthRecorder
                          input={healthInput}
                          loading={healthLoading}
                          mediaMessage={mediaMessage}
                          mediaUploadMessage={mediaUploadMessage}
                          message={healthMessage}
                          isEditing={Boolean(editingHealthRecord)}
                          pendingMedia={pendingMedia}
                          result={latestResult}
                          episodeId={latestEpisodeId}
                          pet={selectedPet}
                          aiAccess={aiAccess}
                          vetDraft={
                            latestEpisodeId ? vetDrafts[latestEpisodeId] : undefined
                          }
                          vetDraftLoading={
                            Boolean(latestEpisodeId) &&
                            vetDraftLoadingEpisodeId === latestEpisodeId
                          }
                          vetDraftNotice={
                            latestEpisodeId &&
                            vetDraftNotice.episodeId === latestEpisodeId
                              ? vetDraftNotice
                              : null
                          }
                          onPickMedia={pickMedia}
                          onRemoveMedia={removePendingMedia}
                          setInput={setHealthInput}
                          onSubmit={submitHealthCheck}
                          onGoAccount={() => setMainSection("account")}
                          onCreateVetDraft={createVetDraft}
                          onShareVetDraft={shareVetDraft}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {mainSection === "reports" ? (
                    selectedPet ? (
                      <HealthHistoryCard
                        aiAccess={aiAccess}
                        aiFeedbackDrafts={aiFeedbackDrafts}
                        aiFeedbackNotice={aiFeedbackNotice}
                        aiFeedbackSavingUsageId={aiFeedbackSavingUsageId}
                        episodeGroups={episodeReportGroups}
                        flow={healthFlow}
                        history={selectedPetHistory}
                        loading={historyLoading}
                        message={historyMessage}
                        editingPlanEpisodeId={editingPlanEpisodeId}
                        planDraft={planDraft}
                        planSavingEpisodeId={planSavingEpisodeId}
                        planTogglingTaskId={planTogglingTaskId}
                        planNotice={planNotice}
                        progressDraft={progressDraft}
                        progressNotice={progressNotice}
                        progressSavingKey={progressSavingKey}
                        vetDraftLoadingEpisodeId={vetDraftLoadingEpisodeId}
                        vetDraftNotice={vetDraftNotice}
                        vetDrafts={vetDrafts}
                        savedAiFeedbackUsageIds={savedAiFeedbackUsageIds}
                        onRefresh={() => loadPetHistory(selectedPet)}
                        onShareReport={shareEpisodeReport}
                        onEditRecord={startEditingHealthRecord}
                        onDeleteRecord={confirmDeleteHealthRecord}
                        onCreateVetDraft={createVetDraft}
                        onSaveAiFeedback={saveAiFeedback}
                        onShareVetDraft={shareVetDraft}
                        onStartPlanEdit={startPlanEdit}
                        onCancelPlanEdit={cancelPlanEdit}
                        onChangePlanDraft={setPlanDraft}
                        onSavePlan={saveEpisodePlan}
                        onTogglePlanTask={toggleEpisodePlanTask}
                        onStartProgressEdit={startProgressEdit}
                        onCancelProgressEdit={cancelProgressEdit}
                        onChangeProgressDraft={setProgressDraft}
                        onChangeAiFeedbackDraft={updateAiFeedbackDraft}
                        onSaveProgress={saveEpisodeProgress}
                        shareMessage={shareMessage}
                      />
                    ) : (
                      <ReportsEmptyState onGoRecord={startHealthRecord} />
                    )
                  ) : null}
                  {mainSection === "account" ? accountCard : null}
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
              oauthLoading={oauthLoading}
              onOAuth={submitOAuth}
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

function AppBrandMark() {
  return (
    <Image
      accessible={false}
      resizeMode="cover"
      source={require("./assets/brand-icon.png")}
      style={styles.appBrandIcon}
    />
  );
}

function HomeDashboard({
  flow,
  history,
  latestResult,
  pets,
  selectedPet,
  onGoAccount,
  onGoRecord,
  onGoReports,
}: {
  flow: HealthFlowSummary;
  history: HistoryRecord[];
  latestResult: AnalysisResult | null;
  pets: PetProfile[];
  selectedPet?: PetProfile;
  onGoAccount: () => void;
  onGoRecord: () => void;
  onGoReports: () => void;
}) {
  const latestRecord = history[0];
  const score = latestResult?.riskScore ?? latestRecord?.result.riskScore;
  const riskLevel = latestResult?.riskLevel ?? latestRecord?.result.riskLevel;
  const latestAt = latestResult?.createdAt ?? latestRecord?.result.createdAt;

  if (!pets.length) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardEyebrow}>WELCOME</Text>
        <Text style={styles.cardTitle}>함께할 아이를 먼저 알려주세요</Text>
        <Text style={styles.cardText}>
          이름과 종류만 저장하면 오늘 기록, 건강 흐름, 병원 공유 요약을 이어서
          관리할 수 있어요.
        </Text>
        <SecondaryButton label="첫 반려동물 등록" onPress={onGoRecord} />
      </View>
    );
  }

  return (
    <>
      <View style={styles.homePetCard}>
        <View style={styles.petAvatarLarge}>
          <Text style={styles.petAvatarLargeText}>
            {avatarLabel(selectedPet?.name ?? "펫")}
          </Text>
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardEyebrow}>TODAY</Text>
          <Text style={styles.cardTitle}>
            {selectedPet ? `${selectedPet.name}의 오늘을 살펴봐요` : "오늘을 살펴봐요"}
          </Text>
          <Text style={styles.cardText}>
            기록은 짧게 남기고, 흐름과 병원 공유 준비는 PetFlow가 정리해요.
          </Text>
        </View>
      </View>

      <View style={styles.homeGrid}>
        <View style={styles.homeScoreCard}>
          <Text style={styles.cardEyebrow}>CHECK SCORE</Text>
          <Text style={styles.homeScoreValue}>{score ?? "--"}</Text>
          <Text style={styles.homeScoreLabel}>
            {riskLevel ? riskLabels[riskLevel] : "첫 기록을 기다려요"}
          </Text>
          <Text style={styles.homeMutedText}>
            {latestAt ? `${formatRecordedAt(latestAt)} 기준` : "오늘 기록을 남기면 바로 보여요."}
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onGoRecord}
            style={styles.homePrimaryAction}
          >
            <Text style={styles.homePrimaryActionText}>오늘 기록하기</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.homeFlowCard}>
          <Text style={styles.cardEyebrow}>HEALTH FLOW</Text>
          <Text style={styles.homeFlowTitle}>{flow.recordCount}회 기록</Text>
          <Text style={styles.homeFlowHeadline}>{flow.headline}</Text>
          <Text style={styles.homeMutedText} numberOfLines={3}>
            {flow.description}
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onGoReports}
            style={styles.homeSecondaryAction}
          >
            <Text style={styles.homeSecondaryActionText}>보고서 보기</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.homeActionCard}>
        <Text style={styles.cardEyebrow}>NEXT</Text>
        <Text style={styles.cardTitle}>한눈에 보고 이어서 관리해요</Text>
        <View style={styles.homeActionRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onGoRecord}
            style={styles.homeActionButton}
          >
            <Text style={styles.homeActionButtonText}>기록</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onGoReports}
            style={styles.homeActionButton}
          >
            <Text style={styles.homeActionButtonText}>보고서</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onGoAccount}
            style={styles.homeActionButton}
          >
            <Text style={styles.homeActionButtonText}>계정</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

function MainSectionTabs({
  value,
  onChange,
}: {
  value: MainSection;
  onChange: (value: MainSection) => void;
}) {
  return (
    <View style={styles.mainTabs}>
      {mainSectionOptions.map((section) => {
        const active = section.id === value;
        return (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            activeOpacity={0.85}
            key={section.id}
            onPress={() => onChange(section.id)}
            style={[styles.mainTab, active && styles.mainTabActive]}
          >
            <Text style={[styles.mainTabText, active && styles.mainTabTextActive]}>
              {section.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ReportsEmptyState({ onGoRecord }: { onGoRecord: () => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardEyebrow}>REPORTS</Text>
      <Text style={styles.cardTitle}>먼저 반려동물을 등록해 주세요</Text>
      <Text style={styles.cardText}>
        기록과 수의사 검토용 보고서는 반려동물별로 모아서 보여드려요.
      </Text>
      <SecondaryButton label="오늘 기록으로 이동" onPress={onGoRecord} />
    </View>
  );
}

function isStrongPassword(value: string) {
  return passwordPolicy.every((item) => item.test(value));
}

function PasswordChecklist({ password }: { password: string }) {
  return (
    <View style={styles.passwordChecklist} accessibilityLabel="비밀번호 조건">
      {passwordPolicy.map((item) => {
        const passed = item.test(password);
        return (
          <View
            key={item.id}
            style={[styles.passwordCheckItem, passed && styles.passwordCheckItemPassed]}
          >
            <Text
              style={[styles.passwordCheckText, passed && styles.passwordCheckTextPassed]}
            >
              {passed ? "✓" : "•"} {item.label}
            </Text>
          </View>
        );
      })}
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
  oauthLoading,
  onOAuth,
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
  oauthLoading: OAuthProvider | null;
  onOAuth: (provider: OAuthProvider) => Promise<void>;
  onSubmit: () => Promise<void>;
}) {
  const authBusy = loading || oauthLoading !== null;
  const [showEmailAuth, setShowEmailAuth] = useState(false);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Google 또는 Apple로 시작하기</Text>
      <Text style={styles.cardText}>
        이메일 확인과 비밀번호 관리는 각 계정에서 맡기고, 펫플로우는 로그인 후
        닉네임과 테스트 연락처만 한 번 확인해요.
      </Text>

      <View style={styles.oauthButtons}>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={authBusy}
          onPress={() => void onOAuth("google")}
          style={[styles.oauthButton, authBusy && styles.buttonDisabled]}
        >
          <Text style={styles.oauthButtonMark}>G</Text>
          <Text style={styles.oauthButtonText}>
            {oauthLoading === "google" ? "Google 로그인 중..." : "Google로 계속하기"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={authBusy}
          onPress={() => void onOAuth("apple")}
          style={[styles.oauthButton, styles.oauthButtonDark, authBusy && styles.buttonDisabled]}
        >
          <Text style={[styles.oauthButtonMark, styles.oauthButtonMarkDark]}></Text>
          <Text style={[styles.oauthButtonText, styles.oauthButtonTextDark]}>
            {oauthLoading === "apple" ? "Apple 로그인 중..." : "Apple로 계속하기"}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.authHint}>
        Google은 확인된 이메일을 제공해요. Apple은 비공개 릴레이 이메일로 연결될 수
        있어요.
      </Text>
      <Message text={message} />

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setShowEmailAuth((current) => !current)}
        style={styles.emailFallbackToggle}
      >
        <Text style={styles.emailFallbackText}>
          {showEmailAuth ? "이메일 계정 접기" : "기존 이메일 계정으로 계속하기"}
        </Text>
      </TouchableOpacity>

      {showEmailAuth ? (
        <View style={styles.emailFallbackPanel}>
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

          <View style={styles.authDivider}>
            <View style={styles.authDividerLine} />
            <Text style={styles.authDividerText}>이메일과 비밀번호</Text>
            <View style={styles.authDividerLine} />
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
          {mode === "signup" ? (
            <Text style={styles.fieldHelp}>
              가입 후 이메일 인증을 완료하면 기록을 안전하게 이어갈 수 있어요.
            </Text>
          ) : null}

          <FieldLabel label="비밀번호" />
          <TextInput
            autoCapitalize="none"
            maxLength={64}
            onChangeText={setPassword}
            placeholder={mode === "signup" ? "8자 이상, 영문·숫자·특수문자" : "비밀번호"}
            placeholderTextColor={colors.placeholder}
            secureTextEntry
            style={styles.input}
            textContentType={mode === "login" ? "password" : "newPassword"}
            value={password}
          />
          {mode === "signup" ? <PasswordChecklist password={password} /> : null}

          {mode === "signup" && <TesterFields draft={draft} setDraft={setDraft} />}

          <PrimaryButton
            disabled={authBusy}
            label={loading ? "확인 중..." : mode === "login" ? "로그인" : "가입하고 시작"}
            onPress={onSubmit}
          />
        </View>
      ) : null}
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
        닉네임과 연락용 010 번호를 저장해요. 인증번호는 보내지 않아요.
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

      <FieldLabel label="휴대전화번호 (연락용)" />
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
          전화번호는 본인 인증, 광고나 마케팅에 사용하지 않습니다.
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
  aiAccess,
  aiCodeDraft,
  aiCodeLoading,
  aiCodeMessage,
  accountDeletionLoading,
  accountDeletionMessage,
  accountDeletionRequested,
  user,
  testerProfile,
  linkOauthLoading,
  linkOauthMessage,
  disabled,
  onChangeAiCode,
  onLinkOAuth,
  onRedeemAiCode,
  onRequestAccountDeletion,
  onSignOut,
}: {
  aiAccess: AiAccessStatus | null;
  aiCodeDraft: string;
  aiCodeLoading: boolean;
  aiCodeMessage: string;
  accountDeletionLoading: boolean;
  accountDeletionMessage: string;
  accountDeletionRequested: boolean;
  user: User;
  testerProfile: TesterProfile | null;
  linkOauthLoading: OAuthProvider | null;
  linkOauthMessage: string;
  disabled: boolean;
  onChangeAiCode: (value: string) => void;
  onLinkOAuth: (provider: OAuthProvider) => Promise<void>;
  onRedeemAiCode: () => Promise<void>;
  onRequestAccountDeletion: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const googleLinked = hasLinkedProvider(user, "google");

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

      <View style={styles.identityLinkBox}>
        <View style={styles.identityLinkHeader}>
          <View style={styles.cardHeaderText}>
            <Text style={styles.identityLinkTitle}>로그인 연결</Text>
            <Text style={styles.identityLinkText}>
              기존 이메일 계정에 Google을 연결하면 반려동물, 기록, GPT 권한이
              그대로 이어져요.
            </Text>
          </View>
          <Text
            style={[
              styles.identityLinkBadge,
              googleLinked && styles.identityLinkBadgeConnected,
            ]}
          >
            {googleLinked ? "Google 연결됨" : "연결 전"}
          </Text>
        </View>
        {googleLinked ? (
          <Text style={styles.identityLinkSuccess}>
            Google로 다시 로그인해도 지금 계정의 기록을 그대로 볼 수 있어요.
          </Text>
        ) : (
          <>
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={disabled || linkOauthLoading !== null}
              onPress={() => void onLinkOAuth("google")}
              style={[
                styles.identityLinkButton,
                (disabled || linkOauthLoading !== null) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.identityLinkButtonText}>
                {linkOauthLoading === "google" ? "Google 연결 중" : "Google 계정 연결"}
              </Text>
            </TouchableOpacity>
            <Text style={styles.identityLinkHelp}>
              로그아웃 상태에서 Google로 새로 시작하면 기록이 다른 계정으로 나뉠
              수 있어요. 먼저 이메일 계정으로 로그인한 뒤 연결해 주세요.
            </Text>
          </>
        )}
        <Message
          text={linkOauthMessage}
          tone={linkOauthMessage.includes("연결했어요") ? "success" : "error"}
        />
      </View>

      <View style={[styles.aiAccessBox, aiAccess?.enabled && styles.aiAccessBoxEnabled]}>
        <View style={styles.aiAccessHeader}>
          <View style={styles.cardHeaderText}>
            <Text style={styles.aiAccessTitle}>GPT 테스터 키</Text>
            <Text style={styles.aiAccessText}>{aiAccessCopy(aiAccess)}</Text>
          </View>
          <Text
            style={[
              styles.aiAccessBadge,
              aiAccess?.enabled && styles.aiAccessBadgeEnabled,
            ]}
          >
            {aiAccess?.enabled ? "사용 가능" : "키 필요"}
          </Text>
        </View>

        {aiAccess?.enabled ? (
          <View style={styles.aiUsageRow}>
            <View style={styles.aiUsageItem}>
              <Text style={styles.aiUsageLabel}>이번 달</Text>
              <Text style={styles.aiUsageValue}>
                {aiAccess.usedThisMonth}/{aiAccess.monthlyReportLimit}회
              </Text>
            </View>
            <View style={styles.aiUsageItem}>
              <Text style={styles.aiUsageLabel}>전체</Text>
              <Text style={styles.aiUsageValue}>
                {aiAccess.usedTotal}
                {aiAccess.totalReportLimit ? `/${aiAccess.totalReportLimit}` : ""}회
              </Text>
            </View>
            <View style={styles.aiUsageItem}>
              <Text style={styles.aiUsageLabel}>그룹</Text>
              <Text style={styles.aiUsageValue}>{aiAccess.codeLabel ?? "테스터"}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.aiCodeForm}>
            <TextInput
              autoCapitalize="characters"
              autoCorrect={false}
              onChangeText={(value) => onChangeAiCode(value.toUpperCase())}
              placeholder="PF-ABCD-1234-EFGH"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, styles.aiCodeInput]}
              value={aiCodeDraft}
            />
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={aiCodeLoading}
              onPress={() => void onRedeemAiCode()}
              style={[styles.aiCodeButton, aiCodeLoading && styles.buttonDisabled]}
            >
              <Text style={styles.aiCodeButtonText}>
                {aiCodeLoading ? "확인 중" : "키 등록"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        <Message
          text={aiCodeMessage}
          tone={aiCodeMessage === "테스터 키가 등록됐어요." ? "success" : "error"}
        />
      </View>

      <View style={styles.accountDeletionBox}>
        <Text style={styles.accountDeletionTitle}>계정 삭제 요청</Text>
        <Text style={styles.accountDeletionText}>
          테스트를 중단하려면 요청을 남겨주세요. 운영자가 확인 후 계정과 연결된
          반려동물, 건강 기록, GPT 사용 권한을 삭제합니다.
        </Text>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={disabled || accountDeletionLoading || accountDeletionRequested}
          onPress={() => void onRequestAccountDeletion()}
          style={[
            styles.accountDeletionButton,
            (disabled || accountDeletionLoading || accountDeletionRequested) &&
              styles.buttonDisabled,
          ]}
        >
          <Text style={styles.accountDeletionButtonText}>
            {accountDeletionRequested
              ? "삭제 요청 접수됨"
              : accountDeletionLoading
                ? "요청 중"
                : "계정 삭제 요청"}
          </Text>
        </TouchableOpacity>
        <Message
          text={accountDeletionMessage}
          tone={accountDeletionRequested ? "success" : "error"}
        />
      </View>

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
  formExpanded,
  loading,
  message,
  pets,
  selectedPetId,
  setDraft,
  onCancelForm,
  onEdit,
  onNew,
  onSave,
  onSelect,
}: {
  draft: PetDraft;
  editingPetId: string | null;
  formExpanded: boolean;
  loading: boolean;
  message: string;
  pets: PetProfile[];
  selectedPetId?: string;
  setDraft: (draft: PetDraft) => void;
  onCancelForm: () => void;
  onEdit: (pet: PetProfile) => void;
  onNew: () => void;
  onSave: () => Promise<void>;
  onSelect: (petId: string) => void;
}) {
  const selectedPet = pets.find((pet) => pet.id === selectedPetId);
  const showPetForm = formExpanded || !pets.length;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardEyebrow}>MY FAMILY</Text>
          <Text style={styles.cardTitle}>함께하는 아이들</Text>
          {pets.length ? (
            <Text style={styles.cardText}>
              {selectedPet ? `${selectedPet.name} 중심으로 오늘 기록을 이어갈게요.` : "오늘 기록할 아이를 선택해 주세요."}
            </Text>
          ) : null}
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
                    {avatarLabel(pet.name)}
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
          <Text style={styles.selectedPetLabel}>오늘 살펴볼 아이</Text>
          <Text style={styles.selectedPetName}>{selectedPet.name}</Text>
        </View>
      ) : null}

      {showPetForm ? (
        <PetForm
          draft={draft}
          editing={Boolean(editingPetId)}
          loading={loading}
          setDraft={setDraft}
          onCancel={pets.length ? onCancelForm : undefined}
          onSave={onSave}
        />
      ) : null}
      <Message text={message} />
    </View>
  );
}

function PetForm({
  draft,
  editing,
  loading,
  setDraft,
  onCancel,
  onSave,
}: {
  draft: PetDraft;
  editing: boolean;
  loading: boolean;
  setDraft: (draft: PetDraft) => void;
  onCancel?: () => void;
  onSave: () => Promise<void>;
}) {
  const breedSuggestions = breedOptions[draft.species];
  const birthDateShortcuts = useMemo(() => buildBirthDateShortcuts(), []);
  const selectedBreed = draft.breed.trim();

  const chooseSpecies = (species: Species) => {
    setDraft({
      ...draft,
      species,
      breed: species === draft.species ? draft.breed : "",
    });
  };

  return (
    <View style={styles.petForm}>
      <View style={styles.petFormHeader}>
        <Text style={styles.formTitle}>
          {editing ? "반려동물 정보 수정" : "반려동물 등록"}
        </Text>
        {onCancel ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onCancel}
            style={styles.formCloseButton}
          >
            <Text style={styles.formCloseButtonText}>접기</Text>
          </TouchableOpacity>
        ) : null}
      </View>
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
        onSelect={chooseSpecies}
      />

      <FieldLabel label="품종 (선택)" />
      {breedSuggestions.length ? (
        <View style={styles.choicePanel}>
          <Text style={styles.choicePanelText}>자주 쓰는 품종을 먼저 골라요.</Text>
          <ChipGroup
            options={breedSuggestions.map((breed) => ({ id: breed, label: breed }))}
            selected={selectedBreed}
            onSelect={(breed) => setDraft({ ...draft, breed })}
          />
        </View>
      ) : (
        <Text style={styles.helperText}>특별히 정해진 품종이 없으면 비워둬도 괜찮아요.</Text>
      )}
      <TextInput
        maxLength={40}
        onChangeText={(breed) => setDraft({ ...draft, breed })}
        placeholder="목록에 없으면 직접 입력"
        placeholderTextColor={colors.placeholder}
        style={[styles.input, styles.inputAfterChoice]}
        value={draft.breed}
      />

      <FieldLabel label="생일 (선택)" />
      <View style={styles.choicePanel}>
        <Text style={styles.choicePanelText}>정확하지 않으면 비워둬도 돼요.</Text>
        <ChipGroup
          options={birthDateShortcuts}
          selected={draft.birthDate}
          onSelect={(birthDate) => setDraft({ ...draft, birthDate })}
        />
      </View>
      <TextInput
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        onChangeText={(birthDate) => setDraft({ ...draft, birthDate })}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.placeholder}
        style={[styles.input, styles.inputAfterChoice]}
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

function HealthRecorder({
  input,
  loading,
  mediaMessage,
  mediaUploadMessage,
  message,
  isEditing,
  pendingMedia,
  result,
  episodeId,
  pet,
  aiAccess,
  vetDraft,
  vetDraftLoading,
  vetDraftNotice,
  onPickMedia,
  onRemoveMedia,
  setInput,
  onSubmit,
  onGoAccount,
  onCreateVetDraft,
  onShareVetDraft,
}: {
  input: HealthCheckInput;
  loading: boolean;
  mediaMessage: string;
  mediaUploadMessage: string;
  message: string;
  isEditing: boolean;
  pendingMedia: PendingMediaAsset[];
  result: AnalysisResult | null;
  episodeId: string | null;
  pet: PetProfile;
  aiAccess: AiAccessStatus | null;
  vetDraft?: VetReviewDraft;
  vetDraftLoading: boolean;
  vetDraftNotice: EpisodeNotice | null;
  onPickMedia: () => Promise<void>;
  onRemoveMedia: (id: string) => void;
  setInput: (input: HealthCheckInput) => void;
  onSubmit: () => Promise<void>;
  onGoAccount: () => void;
  onCreateVetDraft: (episodeId: string) => Promise<void>;
  onShareVetDraft: (episodeId: string, draft: VetReviewDraft) => Promise<void>;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardEyebrow}>TODAY CHECK</Text>
      <Text style={styles.cardTitle}>
        {isEditing ? `${pet.name} 기록 수정` : `${pet.name} 오늘 건강 기록`}
      </Text>
      <Text style={styles.cardText}>
        {isEditing
          ? "수정할 부분만 바꾼 뒤 저장해 주세요. 첨부 변경은 새 기록에서 다시 추가할 수 있어요."
          : "특별한 변화가 없으면 평소 상태 버튼만 눌러도 충분해요. 달라진 점이 있을 때만 증상과 메모를 더해 주세요."}
      </Text>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setInput(resetToNormal(input))}
        style={styles.normalButton}
      >
        <Text style={styles.normalButtonTitle}>오늘은 평소와 같아요</Text>
        <Text style={styles.normalButtonText}>
          증상 없음, 식욕·활력 평소 상태로 빠르게 채워요.
        </Text>
      </TouchableOpacity>

      <FieldLabel label="보이는 증상 (선택)" />
      <MultiChipGroup
        options={symptomOptions}
        selected={input.symptoms}
        onToggle={(symptom) =>
          setInput({ ...input, symptoms: toggleItem(input.symptoms, symptom) })
        }
      />

      <FieldLabel label="식욕" />
      <ChipGroup
        options={levelOptions}
        selected={input.appetite}
        onSelect={(appetite) => setInput({ ...input, appetite })}
      />

      <FieldLabel label="활력" />
      <ChipGroup
        options={levelOptions}
        selected={input.energy}
        onSelect={(energy) => setInput({ ...input, energy })}
      />

      <FieldLabel label="언제부터 이어졌나요?" />
      <ChipGroup
        options={durationOptions}
        selected={input.duration}
        onSelect={(duration) => setInput({ ...input, duration })}
      />

      <FieldLabel label="바로 확인이 필요한 신호 (해당 시 선택)" />
      <MultiChipGroup
        danger
        options={redFlagOptions}
        selected={input.redFlags}
        onToggle={(flag) =>
          setInput({ ...input, redFlags: toggleItem(input.redFlags, flag) })
        }
      />

      <FieldLabel label="추가 메모 (선택)" />
      <TextInput
        maxLength={1000}
        multiline
        onChangeText={(note) => setInput({ ...input, note })}
        placeholder="언제, 어떤 상황에서 달라졌는지만 짧게 적어도 충분해요."
        placeholderTextColor={colors.placeholder}
        style={[styles.input, styles.textarea]}
        textAlignVertical="top"
        value={input.note}
      />

      <MediaPickerSection
        disabled={isEditing}
        mediaMessage={mediaMessage}
        onPickMedia={onPickMedia}
        onRemoveMedia={onRemoveMedia}
        pendingMedia={pendingMedia}
      />

      <PrimaryButton
        disabled={loading}
        label={
          loading
            ? isEditing
              ? "수정 중..."
              : "기록 중..."
            : isEditing
              ? "수정 완료하기"
              : "오늘 건강 기록 저장"
        }
        onPress={onSubmit}
      />
      <Message text={message} />
      <Message text={mediaUploadMessage} tone="success" />

      {result ? (
        <HealthResultCard
          aiAccess={aiAccess}
          episodeId={episodeId}
          result={result}
          vetDraft={vetDraft}
          vetDraftLoading={vetDraftLoading}
          vetDraftNotice={vetDraftNotice}
          onCreateVetDraft={onCreateVetDraft}
          onGoAccount={onGoAccount}
          onShareVetDraft={onShareVetDraft}
        />
      ) : null}
    </View>
  );
}

function MediaPickerSection({
  disabled = false,
  mediaMessage,
  onPickMedia,
  onRemoveMedia,
  pendingMedia,
}: {
  disabled?: boolean;
  mediaMessage: string;
  onPickMedia: () => Promise<void>;
  onRemoveMedia: (id: string) => void;
  pendingMedia: PendingMediaAsset[];
}) {
  return (
    <View style={styles.mediaBox}>
      <View style={styles.mediaHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.mediaTitle}>사진·영상 첨부 (선택)</Text>
          <Text style={styles.mediaText}>
            병원에 보여줄 참고 자료만 골라주세요. PetFlow가 내용을 판독하지는 않아요.
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={disabled}
          onPress={() => void onPickMedia()}
          style={[styles.mediaAddButton, disabled && styles.buttonDisabled]}
        >
          <Text style={styles.mediaAddButtonText}>추가</Text>
        </TouchableOpacity>
      </View>

      {pendingMedia.length ? (
        <View style={styles.mediaList}>
          {pendingMedia.map((item) => (
            <View key={item.id} style={styles.mediaItem}>
              {item.kind === "image" ? (
                <Image source={{ uri: item.uri }} style={styles.mediaThumb} />
              ) : (
                <View style={[styles.mediaThumb, styles.videoThumb]}>
                  <Text style={styles.videoThumbText}>영상</Text>
                </View>
              )}
              <View style={styles.mediaItemText}>
                <Text numberOfLines={1} style={styles.mediaFileName}>
                  {item.fileName}
                </Text>
                <Text style={styles.mediaFileMeta}>
                  {item.kind === "image" ? "사진" : "영상"} ·{" "}
                  {item.sizeBytes ? formatFileSize(item.sizeBytes) : "크기 확인 중"}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => onRemoveMedia(item.id)}
                style={styles.mediaRemoveButton}
              >
                <Text style={styles.mediaRemoveButtonText}>삭제</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.mediaEmptyText}>
          최대 {maxReportMediaFiles}개, 파일 하나당 50MB까지 저장할 수 있어요.
        </Text>
      )}
      <Message text={mediaMessage} />
    </View>
  );
}

function MultiChipGroup<T extends string>({
  danger = false,
  options,
  selected,
  onToggle,
}: {
  danger?: boolean;
  options: Array<{ id: T; label: string }>;
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <View style={styles.chipGroup}>
      {options.map((option) => {
        const isSelected = selected.includes(option.id);
        return (
          <TouchableOpacity
            activeOpacity={0.85}
            key={option.id}
            onPress={() => onToggle(option.id)}
            style={[
              styles.chip,
              isSelected && (danger ? styles.chipDangerSelected : styles.chipSelected),
            ]}
          >
            <Text
              style={[
                styles.chipText,
                isSelected && styles.chipTextSelected,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function HealthResultCard({
  aiAccess,
  episodeId,
  result,
  vetDraft,
  vetDraftLoading,
  vetDraftNotice,
  onCreateVetDraft,
  onGoAccount,
  onShareVetDraft,
}: {
  aiAccess: AiAccessStatus | null;
  episodeId: string | null;
  result: AnalysisResult;
  vetDraft?: VetReviewDraft;
  vetDraftLoading: boolean;
  vetDraftNotice: EpisodeNotice | null;
  onCreateVetDraft: (episodeId: string) => Promise<void>;
  onGoAccount: () => void;
  onShareVetDraft: (episodeId: string, draft: VetReviewDraft) => Promise<void>;
}) {
  return (
    <View style={[styles.resultCard, styles[`resultCard_${result.riskLevel}`]]}>
      <View style={styles.resultHeader}>
        <View>
          <Text style={styles.resultEyebrow}>CHECK SCORE</Text>
          <Text style={styles.resultScore}>{result.riskScore}</Text>
        </View>
        <Text style={styles.resultRisk}>{riskLabels[result.riskLevel]}</Text>
      </View>
      <Text style={styles.resultTitle}>{result.headline}</Text>
      <Text style={styles.resultSummary}>{result.summary}</Text>
      <Text style={styles.resultMeta}>
        {recordDateLabel(result.createdAt)} ·{" "}
        {result.storage === "remote" ? "서버 저장 완료" : "기기 내 결과"} ·{" "}
        {result.source === "openai" ? "AI 정리 포함" : "기본 안전 규칙"}
        {episodeId ? ` · 사건 연결됨` : ""}
      </Text>

      <ResultList title="지금 할 수 있는 일" items={result.actions} />
      <View style={styles.vetBriefBox}>
        <Text style={styles.vetBriefTitle}>병원에 보여줄 요약</Text>
        <Text style={styles.vetBriefText}>{result.vetBrief}</Text>
      </View>
      <ResultVetDraftBox
        aiAccess={aiAccess}
        episodeId={episodeId}
        vetDraft={vetDraft}
        vetDraftLoading={vetDraftLoading}
        vetDraftNotice={vetDraftNotice}
        onCreateVetDraft={onCreateVetDraft}
        onGoAccount={onGoAccount}
        onShareVetDraft={onShareVetDraft}
      />
      <Text style={styles.disclaimer}>{result.disclaimer}</Text>
    </View>
  );
}

function ResultVetDraftBox({
  aiAccess,
  episodeId,
  vetDraft,
  vetDraftLoading,
  vetDraftNotice,
  onCreateVetDraft,
  onGoAccount,
  onShareVetDraft,
}: {
  aiAccess: AiAccessStatus | null;
  episodeId: string | null;
  vetDraft?: VetReviewDraft;
  vetDraftLoading: boolean;
  vetDraftNotice: EpisodeNotice | null;
  onCreateVetDraft: (episodeId: string) => Promise<void>;
  onGoAccount: () => void;
  onShareVetDraft: (episodeId: string, draft: VetReviewDraft) => Promise<void>;
}) {
  const canUseAiDraft = Boolean(aiAccess?.enabled);
  return (
    <View style={styles.resultVetDraftBox}>
      <View style={styles.planHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.vetDraftEyebrow}>AI DRAFT · VET REVIEW</Text>
          <Text style={styles.planTitle}>수의사 검토용 GPT 초안</Text>
          <Text style={styles.planSubtitle}>
            같은 사건의 기록을 수의사가 보기 좋은 제출용 문장으로 정리해요.
          </Text>
        </View>
        <Text
          style={[
            styles.vetDraftBadge,
            canUseAiDraft && styles.vetDraftBadgeEnabled,
          ]}
        >
          {canUseAiDraft ? "키 확인됨" : "키 필요"}
        </Text>
      </View>

      {!episodeId ? (
        <Text style={styles.planEmptyText}>
          서버에 저장되고 사건에 연결된 기록에서만 GPT 초안을 만들 수 있어요.
        </Text>
      ) : !canUseAiDraft ? (
        <>
          <Text style={styles.planEmptyText}>{aiAccessCopy(aiAccess)}</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onGoAccount}
            style={styles.vetDraftSecondaryButton}
          >
            <Text style={styles.vetDraftSecondaryButtonText}>테스터 키 확인</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.vetDraftActions}>
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={vetDraftLoading}
              onPress={() => void onCreateVetDraft(episodeId)}
              style={[
                styles.vetDraftPrimaryButton,
                vetDraftLoading && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.vetDraftPrimaryButtonText}>
                {vetDraftLoading
                  ? "초안 만드는 중"
                  : vetDraft
                    ? "GPT 초안 다시 만들기"
                    : "GPT 초안 만들기"}
              </Text>
            </TouchableOpacity>
            {vetDraft ? (
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={vetDraftLoading}
                onPress={() => void onShareVetDraft(episodeId, vetDraft)}
                style={styles.vetDraftSecondaryButton}
              >
                <Text style={styles.vetDraftSecondaryButtonText}>초안 공유</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {vetDraft ? (
            <View style={styles.vetDraftPreview}>
              <Text style={styles.vetDraftSource}>
                {vetDraft.source === "openai" ? "GPT 정리 · 확인 전" : "규칙 기반 정리"}
              </Text>
              <Text style={styles.vetDraftOverview}>{vetDraft.overview}</Text>
              <Text style={styles.vetDraftHandoffLabel}>다른 병원 첫 설명</Text>
              <Text style={styles.vetDraftHandoff}>{vetDraft.handoffNote}</Text>
              {vetDraft.questionsForVet.slice(0, 2).map((item) => (
                <Text key={item} style={styles.vetDraftQuestion}>
                  · {item}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      )}

      {vetDraftNotice ? (
        <Message text={vetDraftNotice.text} tone={vetDraftNotice.tone} />
      ) : null}
      <Text style={styles.planLimitText}>
        GPT 초안은 진단·처방·약물명·용량·치료 계획을 만들지 않으며 수의사 확인 전 자료로 표시됩니다.
      </Text>
    </View>
  );
}

function HealthHistoryCard({
  aiAccess,
  aiFeedbackDrafts,
  aiFeedbackNotice,
  aiFeedbackSavingUsageId,
  editingPlanEpisodeId,
  episodeGroups,
  flow,
  history,
  loading,
  message,
  planDraft,
  planNotice,
  planSavingEpisodeId,
  planTogglingTaskId,
  progressDraft,
  progressNotice,
  progressSavingKey,
  vetDraftLoadingEpisodeId,
  vetDraftNotice,
  vetDrafts,
  savedAiFeedbackUsageIds,
  onCancelPlanEdit,
  onCancelProgressEdit,
  onChangeAiFeedbackDraft,
  onChangePlanDraft,
  onChangeProgressDraft,
  onCreateVetDraft,
  onRefresh,
  onSavePlan,
  onSaveProgress,
  onSaveAiFeedback,
  onEditRecord,
  onDeleteRecord,
  onShareReport,
  onShareVetDraft,
  onStartPlanEdit,
  onStartProgressEdit,
  onTogglePlanTask,
  shareMessage,
}: {
  aiAccess: AiAccessStatus | null;
  aiFeedbackDrafts: AiFeedbackDraftMap;
  aiFeedbackNotice: EpisodeNotice;
  aiFeedbackSavingUsageId: string | null;
  editingPlanEpisodeId: string | null;
  episodeGroups: EpisodeReportGroup[];
  flow: HealthFlowSummary;
  history: HistoryRecord[];
  loading: boolean;
  message: string;
  planDraft: string;
  planNotice: EpisodeNotice;
  planSavingEpisodeId: string | null;
  planTogglingTaskId: string | null;
  progressDraft: ProgressDraft | null;
  progressNotice: EpisodeNotice;
  progressSavingKey: string | null;
  vetDraftLoadingEpisodeId: string | null;
  vetDraftNotice: EpisodeNotice;
  vetDrafts: VetDraftMap;
  savedAiFeedbackUsageIds: string[];
  onCancelPlanEdit: () => void;
  onCancelProgressEdit: () => void;
  onChangeAiFeedbackDraft: (
    usageId: string,
    patch: Partial<AiFeedbackDraft>,
  ) => void;
  onChangePlanDraft: (value: string) => void;
  onChangeProgressDraft: (draft: ProgressDraft | null) => void;
  onCreateVetDraft: (episodeId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSavePlan: (episodeId: string) => Promise<void>;
  onSaveProgress: () => Promise<void>;
  onSaveAiFeedback: (episodeId: string, draft: VetReviewDraft) => Promise<void>;
  onEditRecord: (record: HistoryRecord) => void;
  onDeleteRecord: (record: HistoryRecord) => void;
  onShareReport: (report: EpisodeReport) => Promise<void>;
  onShareVetDraft: (episodeId: string, draft: VetReviewDraft) => Promise<void>;
  onStartPlanEdit: (group: EpisodeReportGroup) => void;
  onStartProgressEdit: (group: EpisodeReportGroup, day: FollowUpDay) => void;
  onTogglePlanTask: (
    episodeId: string,
    taskId: string,
    completed: boolean,
  ) => Promise<void>;
  shareMessage: string;
}) {
  const recent = history.slice(0, 5);
  const shareGroups = episodeGroups.slice(0, 4);
  const getAiFeedbackDraft = (draft?: VetReviewDraft) =>
    draft?.usageId
      ? aiFeedbackDrafts[draft.usageId] ?? defaultAiFeedbackDraft
      : defaultAiFeedbackDraft;
  const flowTone =
    flow.trend === "worsening"
      ? styles.flowCard_worsening
      : flow.trend === "watch"
        ? styles.flowCard_watch
        : styles.flowCard_stable;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardEyebrow}>HEALTH FLOW</Text>
          <Text style={styles.cardTitle}>최근 14일 건강 흐름</Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={loading}
          onPress={() => void onRefresh()}
          style={[styles.smallButton, loading && styles.buttonDisabled]}
        >
          <Text style={styles.smallButtonText}>
            {loading ? "확인 중" : "새로고침"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.flowCard, flowTone]}>
        <View style={styles.flowHeader}>
          <Text style={styles.flowCount}>{flow.recordCount}회</Text>
          <Text style={styles.flowWindow}>최근 14일</Text>
        </View>
        <Text style={styles.flowTitle}>{flow.headline}</Text>
        <Text style={styles.flowDescription}>{flow.description}</Text>
        <View style={styles.flowMetaRow}>
          <Text style={styles.flowMeta}>
            최고 단계 {flow.highestRisk ? riskLabels[flow.highestRisk] : "없음"}
          </Text>
          <Text style={styles.flowMeta}>
            최근 기록 {flow.latestRecordedAt ? formatRecordedAt(flow.latestRecordedAt) : "없음"}
          </Text>
        </View>
        <View style={styles.flowTags}>
          {flow.repeatedSymptoms.length ? (
            flow.repeatedSymptoms.map((item) => (
              <Text key={item} style={styles.flowTag}>
                {item}
              </Text>
            ))
          ) : (
            <Text style={styles.flowTag}>반복 증상 없음</Text>
          )}
        </View>
      </View>

      <Message text={message} />

      <Text style={styles.historyTitle}>병원 공유 요약</Text>
      <Text style={styles.sectionHint}>
        같은 사건에 연결된 기록을 수의사가 보기 좋은 제출용 텍스트로 정리해요.
      </Text>
      {shareGroups.length ? (
        <View style={styles.episodeList}>
          {shareGroups.map((group) => (
            <EpisodeReportItem
              aiAccess={aiAccess}
              aiFeedbackDraft={getAiFeedbackDraft(
                group.episode ? vetDrafts[group.episode.id] : undefined,
              )}
              aiFeedbackNotice={aiFeedbackNotice}
              aiFeedbackSavingUsageId={aiFeedbackSavingUsageId}
              editingPlanEpisodeId={editingPlanEpisodeId}
              group={group}
              key={group.key}
              planDraft={planDraft}
              planNotice={planNotice}
              planSavingEpisodeId={planSavingEpisodeId}
              planTogglingTaskId={planTogglingTaskId}
              progressDraft={progressDraft}
              progressNotice={progressNotice}
              progressSavingKey={progressSavingKey}
              vetDraft={group.episode ? vetDrafts[group.episode.id] : undefined}
              vetDraftLoadingEpisodeId={vetDraftLoadingEpisodeId}
              vetDraftNotice={vetDraftNotice}
              savedAiFeedbackUsageIds={savedAiFeedbackUsageIds}
              onCancelPlanEdit={onCancelPlanEdit}
              onCancelProgressEdit={onCancelProgressEdit}
              onChangeAiFeedbackDraft={onChangeAiFeedbackDraft}
              onChangePlanDraft={onChangePlanDraft}
              onChangeProgressDraft={onChangeProgressDraft}
              onCreateVetDraft={onCreateVetDraft}
              onSaveAiFeedback={onSaveAiFeedback}
              onSavePlan={onSavePlan}
              onSaveProgress={onSaveProgress}
              onShareReport={onShareReport}
              onShareVetDraft={onShareVetDraft}
              onStartPlanEdit={onStartPlanEdit}
              onStartProgressEdit={onStartProgressEdit}
              onTogglePlanTask={onTogglePlanTask}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>
          아직 공유할 기록이 없어요. 오늘 기록을 저장하면 요약을 만들 수 있어요.
        </Text>
      )}
      <Message text={shareMessage} tone="success" />

      <Text style={styles.historyTitle}>최근 기록</Text>
      {recent.length ? (
        <View style={styles.historyList}>
          {recent.map((record) => (
            <HistoryRecordItem
              key={record.result.id}
              record={record}
              onDelete={onDeleteRecord}
              onEdit={onEditRecord}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>
          아직 저장된 기록이 없어요. 오늘 기록을 남기면 여기에 쌓여요.
        </Text>
      )}
    </View>
  );
}

function EpisodeReportItem({
  aiAccess,
  aiFeedbackDraft,
  aiFeedbackNotice,
  aiFeedbackSavingUsageId,
  editingPlanEpisodeId,
  group,
  planDraft,
  planNotice,
  planSavingEpisodeId,
  planTogglingTaskId,
  progressDraft,
  progressNotice,
  progressSavingKey,
  vetDraft,
  vetDraftLoadingEpisodeId,
  vetDraftNotice,
  savedAiFeedbackUsageIds,
  onCancelPlanEdit,
  onCancelProgressEdit,
  onChangeAiFeedbackDraft,
  onChangePlanDraft,
  onChangeProgressDraft,
  onCreateVetDraft,
  onSaveAiFeedback,
  onSavePlan,
  onSaveProgress,
  onShareReport,
  onShareVetDraft,
  onStartPlanEdit,
  onStartProgressEdit,
  onTogglePlanTask,
}: {
  aiAccess: AiAccessStatus | null;
  aiFeedbackDraft: AiFeedbackDraft;
  aiFeedbackNotice: EpisodeNotice;
  aiFeedbackSavingUsageId: string | null;
  editingPlanEpisodeId: string | null;
  group: EpisodeReportGroup;
  planDraft: string;
  planNotice: EpisodeNotice;
  planSavingEpisodeId: string | null;
  planTogglingTaskId: string | null;
  progressDraft: ProgressDraft | null;
  progressNotice: EpisodeNotice;
  progressSavingKey: string | null;
  vetDraft?: VetReviewDraft;
  vetDraftLoadingEpisodeId: string | null;
  vetDraftNotice: EpisodeNotice;
  savedAiFeedbackUsageIds: string[];
  onCancelPlanEdit: () => void;
  onCancelProgressEdit: () => void;
  onChangeAiFeedbackDraft: (
    usageId: string,
    patch: Partial<AiFeedbackDraft>,
  ) => void;
  onChangePlanDraft: (value: string) => void;
  onChangeProgressDraft: (draft: ProgressDraft | null) => void;
  onCreateVetDraft: (episodeId: string) => Promise<void>;
  onSaveAiFeedback: (episodeId: string, draft: VetReviewDraft) => Promise<void>;
  onSavePlan: (episodeId: string) => Promise<void>;
  onSaveProgress: () => Promise<void>;
  onShareReport: (report: EpisodeReport) => Promise<void>;
  onShareVetDraft: (episodeId: string, draft: VetReviewDraft) => Promise<void>;
  onStartPlanEdit: (group: EpisodeReportGroup) => void;
  onStartProgressEdit: (group: EpisodeReportGroup, day: FollowUpDay) => void;
  onTogglePlanTask: (
    episodeId: string,
    taskId: string,
    completed: boolean,
  ) => Promise<void>;
}) {
  const episodeId = group.episode?.id;
  const isOpen = group.episode?.status === "open";
  const mediaSummary = group.report.mediaCount
    ? `${group.report.mediaCount}개 첨부`
    : "첨부 없음";
  const planTasks = group.plan?.tasks ?? [];
  const completedTasks =
    planTasks.filter((task) => task.completedAt).length;
  const planSummary = group.plan
    ? `계획 ${completedTasks}/${planTasks.length}`
    : group.episode
      ? "계획 미등록"
      : "개별 기록";
  const isEditingPlan = Boolean(episodeId && editingPlanEpisodeId === episodeId);
  const isSavingPlan = Boolean(episodeId && planSavingEpisodeId === episodeId);
  const itemPlanNotice =
    episodeId && planNotice.episodeId === episodeId ? planNotice : null;
  const initialProgressCount = group.progress.filter((item) =>
    initialFollowUpDays.includes(item.followUpDay),
  ).length;
  const longTermProgressCount = group.progress.filter((item) =>
    longTermFollowUpDays.includes(item.followUpDay),
  ).length;
  const itemProgressNotice =
    episodeId && progressNotice.episodeId === episodeId ? progressNotice : null;
  const canUseAiDraft = Boolean(aiAccess?.enabled);
  const isCreatingVetDraft = Boolean(
    episodeId && vetDraftLoadingEpisodeId === episodeId,
  );
  const itemVetDraftNotice =
    episodeId && vetDraftNotice.episodeId === episodeId ? vetDraftNotice : null;
  const itemAiFeedbackNotice =
    episodeId && aiFeedbackNotice.episodeId === episodeId
      ? aiFeedbackNotice
      : null;
  const feedbackUsageId = vetDraft?.usageId;
  const isSavingAiFeedback = Boolean(
    feedbackUsageId && aiFeedbackSavingUsageId === feedbackUsageId,
  );
  const isAiFeedbackSaved = Boolean(
    feedbackUsageId && savedAiFeedbackUsageIds.includes(feedbackUsageId),
  );

  return (
    <View style={styles.episodeItem}>
      <View style={styles.episodeItemHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.episodeStatus}>
            {isOpen ? "진행 중" : group.episode ? "마무리됨" : "개별 기록"}
          </Text>
          <Text style={styles.episodeTitle}>{group.report.title}</Text>
          <Text style={styles.episodeDescription}>
            {group.report.periodLabel} · {group.report.recordCount}회 기록 · 최고 단계{" "}
            {group.report.highestRiskLabel}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => void onShareReport(group.report)}
          style={styles.episodeShareButton}
        >
          <Text style={styles.episodeShareButtonText}>공유</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.episodeMetaRow}>
        <Text style={styles.episodeMeta}>{planSummary}</Text>
        <Text style={styles.episodeMeta}>초기 경과 {initialProgressCount}/3</Text>
        <Text style={styles.episodeMeta}>장기 경과 {longTermProgressCount}/3</Text>
        <Text style={styles.episodeMeta}>{mediaSummary}</Text>
      </View>

      {episodeId ? (
        <View style={styles.planBox}>
          <View style={styles.planHeader}>
            <View style={styles.cardHeaderText}>
              <Text style={styles.planTitle}>병원에서 받은 안내</Text>
              <Text style={styles.planSubtitle}>
                보호자가 병원 안내를 옮겨 적은 기록이에요. PetFlow가 만든 치료
                계획은 아니에요.
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={isSavingPlan}
              onPress={() =>
                isEditingPlan ? onCancelPlanEdit() : onStartPlanEdit(group)
              }
              style={[styles.planEditButton, isSavingPlan && styles.buttonDisabled]}
            >
              <Text style={styles.planEditButtonText}>
                {isEditingPlan ? "닫기" : planTasks.length ? "수정" : "추가"}
              </Text>
            </TouchableOpacity>
          </View>

          {planTasks.length ? (
            <View style={styles.planTaskList}>
              {planTasks.map((task) => {
                const completed = Boolean(task.completedAt);
                const toggling = planTogglingTaskId === task.id;
                return (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={toggling || isSavingPlan}
                    key={task.id}
                    onPress={() =>
                      void onTogglePlanTask(episodeId, task.id, !completed)
                    }
                    style={[
                      styles.planTaskRow,
                      completed && styles.planTaskRowDone,
                      toggling && styles.buttonDisabled,
                    ]}
                  >
                    <View
                      style={[
                        styles.planTaskCheck,
                        completed && styles.planTaskCheckDone,
                      ]}
                    >
                      <Text style={styles.planTaskCheckText}>
                        {completed ? "✓" : ""}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.planTaskText,
                        completed && styles.planTaskTextDone,
                      ]}
                    >
                      {task.text}
                    </Text>
                    <Text style={styles.planTaskState}>
                      {completed ? "완료" : "진행 전"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.planEmptyText}>
              병원에서 들은 안내를 줄마다 하나씩 적어두면 다음 방문 때 바로
              보여줄 수 있어요.
            </Text>
          )}

          {isEditingPlan ? (
            <View style={styles.planEditor}>
              <TextInput
                multiline
                numberOfLines={5}
                onChangeText={onChangePlanDraft}
                placeholder={"예: 3일 뒤 상태 확인\n예: 물 마시는 양 관찰"}
                placeholderTextColor={colors.placeholder}
                style={[styles.input, styles.textarea, styles.planTextarea]}
                textAlignVertical="top"
                value={planDraft}
              />
              <Text style={styles.planLimitText}>
                최대 5개, 항목당 160자까지 저장할 수 있어요.
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={isSavingPlan}
                onPress={() => void onSavePlan(episodeId)}
                style={[styles.planSaveButton, isSavingPlan && styles.buttonDisabled]}
              >
                <Text style={styles.planSaveButtonText}>
                  {isSavingPlan ? "저장 중" : "안내 저장"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {itemPlanNotice ? (
            <Message text={itemPlanNotice.text} tone={itemPlanNotice.tone} />
          ) : null}
        </View>
      ) : null}

      {episodeId ? (
        <View style={styles.progressBox}>
          <View style={styles.planHeader}>
            <View style={styles.cardHeaderText}>
              <Text style={styles.planTitle}>경과 기록</Text>
              <Text style={styles.planSubtitle}>
                초기 3·7·14일과 장기 30·60·90일 흐름을 같은 사건에 이어
                남겨요.
              </Text>
            </View>
            <Text style={styles.progressBadge}>보호자 경과</Text>
          </View>

          <View style={styles.progressDayList}>
            {followUpGroups.map((followUpGroup) => (
              <View key={followUpGroup.title} style={styles.progressGroup}>
                <View style={styles.progressGroupHead}>
                  <Text style={styles.progressGroupTitle}>{followUpGroup.title}</Text>
                  <Text style={styles.progressGroupDescription}>
                    {followUpGroup.description}
                  </Text>
                </View>
                {followUpGroup.days.map((day) => {
                  const saved = group.progress.find(
                    (item) => item.followUpDay === day,
                  );
                  const isEditing =
                    progressDraft?.episodeId === episodeId &&
                    progressDraft.followUpDay === day;
                  const saving = progressSavingKey === `${episodeId}:${day}`;
                  return (
                    <View
                      key={day}
                      style={[
                        styles.progressDayCard,
                        saved && styles.progressDayCardSaved,
                      ]}
                    >
                      <View style={styles.progressDayHead}>
                        <View style={styles.progressDayPill}>
                          <Text style={styles.progressDayPillText}>{day}일</Text>
                        </View>
                        <View style={styles.cardHeaderText}>
                          <Text style={styles.progressDayTitle}>
                            {followUpDate(
                              group.plan?.reportedAt ?? group.episode?.startedAt,
                              day,
                            )}{" "}
                            확인
                          </Text>
                          <Text style={styles.progressDaySummary}>
                            {saved
                              ? progressSummary(saved)
                              : "아직 경과를 기록하지 않았어요."}
                          </Text>
                        </View>
                        {!isEditing ? (
                          <TouchableOpacity
                            activeOpacity={0.85}
                            disabled={saving}
                            onPress={() => onStartProgressEdit(group, day)}
                            style={[
                              styles.progressEditButton,
                              saving && styles.buttonDisabled,
                            ]}
                          >
                            <Text style={styles.progressEditButtonText}>
                              {saved ? "수정" : "기록"}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      {isEditing && progressDraft ? (
                        <View style={styles.progressEditor}>
                          <Text style={styles.progressEditorLabel}>
                            전반적인 변화
                          </Text>
                          <View style={styles.progressChoiceGrid}>
                            {conditionChangeOptions.map((option) => {
                              const selected =
                                progressDraft.conditionChange === option.id;
                              return (
                                <TouchableOpacity
                                  activeOpacity={0.85}
                                  key={option.id}
                                  onPress={() =>
                                    onChangeProgressDraft({
                                      ...progressDraft,
                                      conditionChange: option.id,
                                    })
                                  }
                                  style={[
                                    styles.progressChoice,
                                    selected && styles.progressChoiceSelected,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.progressChoiceTitle,
                                      selected &&
                                        styles.progressChoiceTitleSelected,
                                    ]}
                                  >
                                    {option.label}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.progressChoiceText,
                                      selected &&
                                        styles.progressChoiceTextSelected,
                                    ]}
                                  >
                                    {option.description}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          <Text style={styles.progressEditorLabel}>식욕</Text>
                          <ChipGroup
                            options={levelOptions}
                            selected={progressDraft.appetite}
                            onSelect={(appetite) =>
                              onChangeProgressDraft({ ...progressDraft, appetite })
                            }
                          />

                          <Text style={styles.progressEditorLabel}>활력</Text>
                          <ChipGroup
                            options={levelOptions}
                            selected={progressDraft.energy}
                            onSelect={(energy) =>
                              onChangeProgressDraft({ ...progressDraft, energy })
                            }
                          />

                          <View style={styles.progressEditorActions}>
                            <TouchableOpacity
                              activeOpacity={0.85}
                              disabled={saving}
                              onPress={onCancelProgressEdit}
                              style={[
                                styles.progressCancelButton,
                                saving && styles.buttonDisabled,
                              ]}
                            >
                              <Text style={styles.progressCancelButtonText}>취소</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              activeOpacity={0.85}
                              disabled={saving}
                              onPress={() => void onSaveProgress()}
                              style={[
                                styles.progressSaveButton,
                                saving && styles.buttonDisabled,
                              ]}
                            >
                              <Text style={styles.progressSaveButtonText}>
                                {saving ? "저장 중" : `${day}일 경과 저장`}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          {itemProgressNotice ? (
            <Message text={itemProgressNotice.text} tone={itemProgressNotice.tone} />
          ) : null}
        </View>
      ) : null}

      {episodeId ? (
        <View style={styles.vetDraftBox}>
          <View style={styles.planHeader}>
            <View style={styles.cardHeaderText}>
              <Text style={styles.vetDraftEyebrow}>AI DRAFT · VET REVIEW</Text>
              <Text style={styles.planTitle}>수의사 검토용 GPT 초안</Text>
              <Text style={styles.planSubtitle}>
                여러 기록, 병원 안내, 경과를 수의사가 빠르게 볼 수 있는 초안으로
                정리해요.
              </Text>
            </View>
            <Text
              style={[
                styles.vetDraftBadge,
                canUseAiDraft && styles.vetDraftBadgeEnabled,
              ]}
            >
              {canUseAiDraft ? "키 확인됨" : "키 필요"}
            </Text>
          </View>

          <View style={styles.vetDraftIncludes}>
            <Text style={styles.vetDraftInclude}>관찰 {group.report.recordCount}회</Text>
            <Text style={styles.vetDraftInclude}>계획 {completedTasks}/{planTasks.length}</Text>
            <Text style={styles.vetDraftInclude}>초기 경과 {initialProgressCount}/3</Text>
            <Text style={styles.vetDraftInclude}>장기 경과 {longTermProgressCount}/3</Text>
            <Text style={styles.vetDraftInclude}>첨부 {group.report.mediaCount}개</Text>
          </View>

          {!canUseAiDraft ? (
            <Text style={styles.planEmptyText}>
              로그인 카드에서 관리자에게 받은 테스터 키를 등록하면 GPT 초안을 만들 수
              있어요. 키별 월간·전체 사용량은 서버에서 관리됩니다.
            </Text>
          ) : (
            <>
              <View style={styles.vetDraftActions}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={isCreatingVetDraft}
                  onPress={() => void onCreateVetDraft(episodeId)}
                  style={[
                    styles.vetDraftPrimaryButton,
                    isCreatingVetDraft && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.vetDraftPrimaryButtonText}>
                    {isCreatingVetDraft
                      ? "초안 만드는 중"
                      : vetDraft
                        ? "GPT 초안 다시 만들기"
                        : "GPT 초안 만들기"}
                  </Text>
                </TouchableOpacity>
                {vetDraft ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={isCreatingVetDraft}
                    onPress={() => void onShareVetDraft(episodeId, vetDraft)}
                    style={styles.vetDraftSecondaryButton}
                  >
                    <Text style={styles.vetDraftSecondaryButtonText}>초안 공유</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {vetDraft ? (
                <View style={styles.vetDraftPreview}>
                  <Text style={styles.vetDraftSource}>
                    {vetDraft.source === "openai" ? "GPT 정리 · 확인 전" : "규칙 기반 정리"}
                  </Text>
                  <Text style={styles.vetDraftOverview}>{vetDraft.overview}</Text>
                  <Text style={styles.vetDraftHandoffLabel}>다른 병원 첫 설명</Text>
                  <Text style={styles.vetDraftHandoff}>{vetDraft.handoffNote}</Text>
                  {vetDraft.questionsForVet.slice(0, 2).map((item) => (
                    <Text key={item} style={styles.vetDraftQuestion}>
                      · {item}
                    </Text>
                  ))}
                  {feedbackUsageId ? (
                    <View style={styles.aiFeedbackBox}>
                      <Text style={styles.aiFeedbackTitle}>테스터 피드백</Text>
                      <Text style={styles.aiFeedbackHint}>
                        수의사에게 보여주기 좋은 초안인지 짧게 알려주세요.
                      </Text>

                      <Text style={styles.aiFeedbackLabel}>유용성</Text>
                      <View style={styles.aiFeedbackScoreRow}>
                        {aiFeedbackScoreOptions.map((option) => {
                          const selected =
                            aiFeedbackDraft.usefulnessScore === option.id;
                          return (
                            <TouchableOpacity
                              activeOpacity={0.85}
                              key={option.id}
                              onPress={() =>
                                onChangeAiFeedbackDraft(feedbackUsageId, {
                                  usefulnessScore: option.id,
                                })
                              }
                              style={[
                                styles.aiFeedbackScoreButton,
                                selected && styles.aiFeedbackScoreButtonSelected,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.aiFeedbackScoreText,
                                  selected && styles.aiFeedbackScoreTextSelected,
                                ]}
                              >
                                {option.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <Text style={styles.aiFeedbackLabel}>비용을 낼 의향</Text>
                      <View style={styles.aiFeedbackPayRow}>
                        {aiWouldPayOptions.map((option) => {
                          const selected = aiFeedbackDraft.wouldPay === option.id;
                          return (
                            <TouchableOpacity
                              activeOpacity={0.85}
                              key={option.id}
                              onPress={() =>
                                onChangeAiFeedbackDraft(feedbackUsageId, {
                                  wouldPay: option.id,
                                })
                              }
                              style={[
                                styles.aiFeedbackPayButton,
                                selected && styles.aiFeedbackPayButtonSelected,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.aiFeedbackPayText,
                                  selected && styles.aiFeedbackPayTextSelected,
                                ]}
                              >
                                {option.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <View style={styles.aiFeedbackInputRow}>
                        <TextInput
                          keyboardType="number-pad"
                          onChangeText={(price) =>
                            onChangeAiFeedbackDraft(feedbackUsageId, { price })
                          }
                          placeholder="적정 가격 (선택)"
                          placeholderTextColor={colors.placeholder}
                          style={[styles.input, styles.aiFeedbackInput]}
                          value={aiFeedbackDraft.price}
                        />
                        <TextInput
                          maxLength={200}
                          onChangeText={(comment) =>
                            onChangeAiFeedbackDraft(feedbackUsageId, { comment })
                          }
                          placeholder="빠진 정보나 아쉬운 점 (선택)"
                          placeholderTextColor={colors.placeholder}
                          style={[styles.input, styles.aiFeedbackInput]}
                          value={aiFeedbackDraft.comment}
                        />
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={isSavingAiFeedback}
                        onPress={() => void onSaveAiFeedback(episodeId, vetDraft)}
                        style={[
                          styles.aiFeedbackSaveButton,
                          isSavingAiFeedback && styles.buttonDisabled,
                        ]}
                      >
                        <Text style={styles.aiFeedbackSaveButtonText}>
                          {isAiFeedbackSaved
                            ? "피드백 다시 저장"
                            : isSavingAiFeedback
                              ? "저장 중"
                              : "피드백 저장"}
                        </Text>
                      </TouchableOpacity>

                      {itemAiFeedbackNotice ? (
                        <Message
                          text={itemAiFeedbackNotice.text}
                          tone={itemAiFeedbackNotice.tone}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          )}

          {itemVetDraftNotice ? (
            <Message text={itemVetDraftNotice.text} tone={itemVetDraftNotice.tone} />
          ) : null}
          <Text style={styles.planLimitText}>
            GPT 초안은 진단·처방·약물명·용량·치료 계획을 만들지 않으며 수의사 확인
            전 자료로 표시됩니다.
          </Text>
        </View>
      ) : null}

      <View style={styles.episodePreviewBox}>
        <Text style={styles.episodePreviewTitle}>제출용 미리보기</Text>
        <Text numberOfLines={5} style={styles.episodePreviewText}>
          {group.report.shareText}
        </Text>
      </View>
      <Text style={styles.disclaimer}>{group.report.disclaimer}</Text>
    </View>
  );
}

function HistoryRecordItem({
  record,
  onDelete,
  onEdit,
}: {
  record: HistoryRecord;
  onDelete: (record: HistoryRecord) => void;
  onEdit: (record: HistoryRecord) => void;
}) {
  const mediaSummary = formatReportMediaSummary(record.media ?? []);
  return (
    <View style={styles.historyItem}>
      <View style={styles.historyItemHeader}>
        <Text style={styles.historyDate}>{formatRecordedAt(record.result.createdAt)}</Text>
        <Text style={styles.historyRisk}>{riskLabels[record.result.riskLevel]}</Text>
      </View>
      <Text style={styles.historySummary}>{record.result.summary}</Text>
      <Text style={styles.historyMeta}>
        CHECK {record.result.riskScore} · {recordSymptomText(record)}
      </Text>
      <Text style={styles.historyMeta}>
        식욕 {optionLabel(levelOptions, record.input.appetite)} · 활력{" "}
        {optionLabel(levelOptions, record.input.energy)} ·{" "}
        {optionLabel(durationOptions, record.input.duration)}
      </Text>
      <Text style={styles.historyStorage}>
        {record.result.storage === "remote" ? "서버 저장" : "기기 내 결과"}
        {record.episodeId ? " · 사건 연결" : ""}
        {mediaSummary ? ` · ${mediaSummary}` : ""}
      </Text>
      <View style={styles.historyActions}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => onEdit(record)}
          style={styles.historyActionButton}
        >
          <Text style={styles.historyActionText}>수정</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => onDelete(record)}
          style={styles.historyActionButton}
        >
          <Text style={[styles.historyActionText, styles.historyActionDanger]}>
            삭제
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={styles.resultList}>
      <Text style={styles.resultListTitle}>{title}</Text>
      {items.map((item) => (
        <Text key={item} style={styles.resultListItem}>
          · {item}
        </Text>
      ))}
    </View>
  );
}

function optionLabel<T extends string>(options: Array<{ id: T; label: string }>, id: T) {
  return options.find((option) => option.id === id)?.label ?? id;
}

function conditionChangeLabel(value: ConditionChange) {
  return (
    conditionChangeOptions.find((option) => option.id === value)?.label ??
    "비슷해요"
  );
}

function progressSummary(item: EpisodeProgress) {
  return `${conditionChangeLabel(item.conditionChange)} · 식욕 ${optionLabel(
    levelOptions,
    item.appetite,
  )} · 활력 ${optionLabel(levelOptions, item.energy)}`;
}

function followUpDate(startedAt: string | undefined, day: FollowUpDay) {
  if (!startedAt) return `${day}일 경과`;
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return `${day}일 경과`;
  date.setDate(date.getDate() + day);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
  }).format(date);
}

function buildBirthDateShortcuts() {
  return [
    { id: "", label: "나중에" },
    { id: formatIsoDate(new Date()), label: "오늘" },
    { id: dateYearsAgo(1), label: "1살쯤" },
    { id: dateYearsAgo(3), label: "3살쯤" },
    { id: dateYearsAgo(5), label: "5살쯤" },
    { id: dateYearsAgo(10), label: "10살쯤" },
  ];
}

function dateYearsAgo(years: number) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return formatIsoDate(date);
}

function formatIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function aiAccessCopy(access: AiAccessStatus | null) {
  if (!access || access.reason === "no_code") {
    return "관리자가 발급한 테스터 키를 입력하면 GPT 초안을 만들 수 있어요.";
  }
  if (access.reason === "monthly_limit") {
    return "이번 달 GPT 초안 사용량을 모두 사용했어요.";
  }
  if (access.reason === "total_limit") {
    return "이 테스터 키의 전체 사용량을 모두 사용했어요.";
  }
  if (access.reason === "revoked") {
    return "이 테스터 키는 현재 사용할 수 없어요.";
  }
  return "권한이 있는 테스터 계정이에요. 사용량은 서버에서 관리됩니다.";
}

function recordSymptomText(record: HistoryRecord) {
  if (!record.input.symptoms.length) return "주요 증상 없음";
  return record.input.symptoms
    .map((symptom) => optionLabel(symptomOptions, symptom))
    .join(", ");
}

function formatRecordedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isRecordedToday(value: string) {
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
  if (Number.isNaN(date.getTime())) return "날짜 확인 필요";
  if (isRecordedToday(value)) return "오늘 기록";
  return `${new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(date)} 기록`;
}

function speciesLabel(species: Species) {
  return speciesOptions.find((option) => option.id === species)?.label ?? "기타";
}

function avatarLabel(value: string, fallback = "펫") {
  return Array.from(value.trim() || fallback).slice(0, 2).join("");
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

function Message({
  text,
  tone = "error",
}: {
  text: string;
  tone?: "error" | "success";
}) {
  if (!text) return null;
  return (
    <Text style={[styles.message, tone === "success" && styles.messageSuccess]}>
      {text}
    </Text>
  );
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

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.secondaryButton}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

const colors = {
  background: "#f2faeb",
  card: "#ffffff",
  green: "#1f936f",
  greenSoft: "#e3f5ec",
  cream: "#fff8df",
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
  fontLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  fontLoadingText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  content: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 40,
  },
  appBrand: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e6eadc",
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  appBrandIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
  },
  badgeText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  brandTagline: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
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
  mainTabs: {
    flexDirection: "row",
    gap: 6,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#d8eadf",
    borderRadius: 999,
    backgroundColor: "#eaf6ef",
    padding: 5,
  },
  mainTab: {
    flex: 1,
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 11,
  },
  mainTabActive: {
    backgroundColor: colors.card,
    shadowColor: "#0a3027",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  mainTabText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  mainTabTextActive: {
    color: colors.green,
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
  cardHeaderText: {
    flex: 1,
    minWidth: 0,
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
  homePetCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 24,
    borderWidth: 1,
    borderColor: "#d8eadf",
    borderRadius: 26,
    backgroundColor: "#ffffff",
    padding: 18,
    shadowColor: "#0a3027",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 20,
    elevation: 3,
  },
  petAvatarLarge: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: colors.greenSoft,
  },
  petAvatarLargeText: {
    color: colors.green,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  homeGrid: {
    gap: 14,
    marginTop: 16,
  },
  homeScoreCard: {
    borderWidth: 1,
    borderColor: "#bfe5d1",
    borderRadius: 26,
    backgroundColor: "#f5fcf8",
    padding: 20,
  },
  homeScoreValue: {
    marginTop: 8,
    color: colors.ink,
    fontSize: 52,
    fontWeight: "900",
    lineHeight: 58,
  },
  homeScoreLabel: {
    color: colors.green,
    fontSize: 15,
    fontWeight: "900",
  },
  homeMutedText: {
    marginTop: 7,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  homePrimaryAction: {
    alignSelf: "flex-start",
    marginTop: 15,
    borderRadius: 999,
    backgroundColor: colors.green,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  homePrimaryActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  homeFlowCard: {
    borderWidth: 1,
    borderColor: "#f0dfad",
    borderRadius: 26,
    backgroundColor: "#fffaf0",
    padding: 20,
  },
  homeFlowTitle: {
    marginTop: 8,
    color: colors.ink,
    fontSize: 28,
    fontWeight: "900",
  },
  homeFlowHeadline: {
    marginTop: 5,
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 22,
  },
  homeSecondaryAction: {
    alignSelf: "flex-start",
    marginTop: 15,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  homeSecondaryActionText: {
    color: colors.green,
    fontSize: 13,
    fontWeight: "900",
  },
  homeActionCard: {
    marginTop: 16,
    borderRadius: 26,
    backgroundColor: "#ffffff",
    padding: 20,
  },
  homeActionRow: {
    flexDirection: "row",
    gap: 9,
    marginTop: 14,
  },
  homeActionButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 17,
    backgroundColor: colors.greenSoft,
    paddingVertical: 13,
  },
  homeActionButtonText: {
    color: colors.green,
    fontSize: 13,
    fontWeight: "900",
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
  oauthButtons: {
    gap: 9,
    marginBottom: 16,
  },
  oauthButton: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 17,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
  },
  oauthButtonDark: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  oauthButtonMark: {
    color: colors.green,
    fontSize: 16,
    fontWeight: "900",
  },
  oauthButtonMarkDark: {
    color: "#ffffff",
  },
  oauthButtonText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  oauthButtonTextDark: {
    color: "#ffffff",
  },
  authHint: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginBottom: 6,
    textAlign: "center",
  },
  emailFallbackToggle: {
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 15,
    backgroundColor: "#fbfcfb",
    marginTop: 4,
    paddingVertical: 12,
  },
  emailFallbackText: {
    color: colors.green,
    fontSize: 13,
    fontWeight: "900",
  },
  emailFallbackPanel: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    backgroundColor: "#fbfcfb",
    gap: 12,
    marginTop: 12,
    padding: 14,
  },
  authDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 2,
  },
  authDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.line,
  },
  authDividerText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
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
  fieldHelp: {
    marginTop: 7,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  passwordChecklist: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 9,
  },
  passwordCheckItem: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    backgroundColor: "#f8fcfa",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  passwordCheckItemPassed: {
    borderColor: "#bfe5d1",
    backgroundColor: "#effaf4",
  },
  passwordCheckText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  passwordCheckTextPassed: {
    color: colors.green,
  },
  inputAfterChoice: {
    marginTop: 9,
  },
  helperText: {
    marginTop: -2,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  choicePanel: {
    gap: 9,
    borderWidth: 1,
    borderColor: "#e0eee6",
    borderRadius: 18,
    backgroundColor: "#f7fcf9",
    padding: 12,
  },
  choicePanelText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
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
  identityLinkBox: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#d7e8df",
    borderRadius: 20,
    backgroundColor: "#f6fbf8",
    padding: 14,
  },
  identityLinkHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  identityLinkTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  identityLinkText: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  identityLinkBadge: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#fff2d4",
    color: "#7d6a45",
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  identityLinkBadgeConnected: {
    backgroundColor: colors.greenSoft,
    color: colors.green,
  },
  identityLinkButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 16,
    backgroundColor: colors.greenSoft,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  identityLinkButtonText: {
    color: colors.green,
    fontSize: 13,
    fontWeight: "900",
  },
  identityLinkHelp: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  identityLinkSuccess: {
    marginTop: 10,
    color: colors.green,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
  },
  aiAccessBox: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    backgroundColor: "#f8fcfa",
    padding: 14,
  },
  aiAccessBoxEnabled: {
    borderColor: "#b8decf",
    backgroundColor: "#eefaf4",
  },
  aiAccessHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  aiAccessTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  aiAccessText: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  aiAccessBadge: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#edf5f0",
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  aiAccessBadgeEnabled: {
    backgroundColor: colors.green,
    color: "#ffffff",
  },
  aiUsageRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  aiUsageItem: {
    flex: 1,
    borderRadius: 15,
    backgroundColor: "#ffffff",
    padding: 10,
  },
  aiUsageLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
  },
  aiUsageValue: {
    marginTop: 4,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  aiCodeForm: {
    gap: 9,
    marginTop: 12,
  },
  aiCodeInput: {
    fontSize: 14,
  },
  aiCodeButton: {
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: colors.green,
    paddingVertical: 13,
  },
  aiCodeButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  accountDeletionBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#efd2ca",
    borderRadius: 20,
    backgroundColor: "#fff8f6",
    padding: 14,
  },
  accountDeletionTitle: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "900",
  },
  accountDeletionText: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  accountDeletionButton: {
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: colors.danger,
    marginTop: 11,
    paddingVertical: 12,
  },
  accountDeletionButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  message: {
    marginTop: 16,
    color: colors.danger,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
  },
  messageSuccess: {
    color: colors.green,
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
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: -0.5,
    textAlign: "center",
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
  petFormHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
  },
  formTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
  },
  formCloseButton: {
    borderRadius: 999,
    backgroundColor: "#edf5f0",
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  formCloseButtonText: {
    color: colors.muted,
    fontSize: 12,
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
  chipDangerSelected: {
    borderColor: colors.danger,
    backgroundColor: colors.danger,
  },
  chipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900",
  },
  chipTextSelected: {
    color: "#ffffff",
  },
  normalButton: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: colors.green,
    borderRadius: 20,
    backgroundColor: "#eefaf4",
    padding: 16,
  },
  normalButtonTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  normalButtonText: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  textarea: {
    minHeight: 94,
  },
  mediaBox: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    backgroundColor: "#f8fcfa",
    padding: 14,
  },
  mediaHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  mediaTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  mediaText: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  mediaAddButton: {
    borderRadius: 999,
    backgroundColor: colors.green,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  mediaAddButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  mediaList: {
    gap: 9,
    marginTop: 13,
  },
  mediaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    padding: 9,
  },
  mediaThumb: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.greenSoft,
  },
  videoThumb: {
    alignItems: "center",
    justifyContent: "center",
  },
  videoThumbText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
  },
  mediaItemText: {
    flex: 1,
    minWidth: 0,
  },
  mediaFileName: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  mediaFileMeta: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  mediaRemoveButton: {
    borderRadius: 999,
    backgroundColor: "#edf5f0",
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  mediaRemoveButtonText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  mediaEmptyText: {
    marginTop: 12,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  resultCard: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 24,
    padding: 18,
  },
  resultCard_watch: {
    backgroundColor: "#f3fbf6",
    borderColor: "#bfe5d1",
  },
  resultCard_soon: {
    backgroundColor: "#fff8eb",
    borderColor: "#f1d08b",
  },
  resultCard_urgent: {
    backgroundColor: "#fff0ec",
    borderColor: "#e9a99a",
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  resultEyebrow: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  resultScore: {
    color: colors.ink,
    fontSize: 44,
    fontWeight: "900",
    lineHeight: 50,
  },
  resultRisk: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: colors.ink,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  resultTitle: {
    marginTop: 10,
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 26,
  },
  resultSummary: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21,
  },
  resultMeta: {
    marginTop: 10,
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
  },
  resultList: {
    gap: 7,
    marginTop: 16,
  },
  resultListTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  resultListItem: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  vetBriefBox: {
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    padding: 14,
  },
  vetBriefTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  vetBriefText: {
    marginTop: 8,
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
  },
  resultVetDraftBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#d7dff0",
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    padding: 13,
  },
  disclaimer: {
    marginTop: 12,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 17,
  },
  flowCard: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
  },
  flowCard_stable: {
    borderColor: "#bfe5d1",
    backgroundColor: "#f3fbf6",
  },
  flowCard_watch: {
    borderColor: "#f1d08b",
    backgroundColor: "#fff8eb",
  },
  flowCard_worsening: {
    borderColor: "#e9a99a",
    backgroundColor: "#fff0ec",
  },
  flowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  flowCount: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 40,
  },
  flowWindow: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: colors.ink,
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  flowTitle: {
    marginTop: 10,
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24,
  },
  flowDescription: {
    marginTop: 7,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  flowMetaRow: {
    gap: 5,
    marginTop: 12,
  },
  flowMeta: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
  },
  flowTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 13,
  },
  flowTag: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  historyTitle: {
    marginTop: 20,
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
  },
  sectionHint: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  episodeList: {
    gap: 12,
    marginTop: 12,
  },
  episodeItem: {
    borderWidth: 1,
    borderColor: "#c8e1d6",
    borderRadius: 20,
    backgroundColor: "#f8fcfa",
    padding: 15,
  },
  episodeItemHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  episodeStatus: {
    alignSelf: "flex-start",
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: colors.greenSoft,
    color: colors.green,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  episodeTitle: {
    marginTop: 9,
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21,
  },
  episodeDescription: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  episodeShareButton: {
    borderRadius: 999,
    backgroundColor: colors.green,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  episodeShareButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  episodeMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 13,
  },
  episodeMeta: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  planBox: {
    marginTop: 13,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: 13,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  planTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  planSubtitle: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  planEditButton: {
    borderRadius: 999,
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  planEditButtonText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
  },
  planTaskList: {
    gap: 8,
    marginTop: 11,
  },
  planTaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 15,
    backgroundColor: "#fbfefd",
    padding: 10,
  },
  planTaskRowDone: {
    borderColor: "#b8decf",
    backgroundColor: "#eefaf4",
  },
  planTaskCheck: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#b8cfc4",
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },
  planTaskCheckDone: {
    borderColor: colors.green,
    backgroundColor: colors.green,
  },
  planTaskCheckText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  planTaskText: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  planTaskTextDone: {
    color: colors.muted,
    textDecorationLine: "line-through",
  },
  planTaskState: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  planEmptyText: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  planEditor: {
    marginTop: 12,
  },
  planTextarea: {
    minHeight: 112,
  },
  planLimitText: {
    marginTop: 7,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  planSaveButton: {
    marginTop: 10,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: colors.green,
    paddingVertical: 13,
  },
  planSaveButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  progressBox: {
    marginTop: 13,
    borderWidth: 1,
    borderColor: "#c8e1d6",
    borderRadius: 18,
    backgroundColor: "#f4fbf7",
    padding: 13,
  },
  progressBadge: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: colors.greenSoft,
    color: colors.green,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  progressDayList: {
    gap: 9,
    marginTop: 11,
  },
  progressGroup: {
    gap: 9,
  },
  progressGroupHead: {
    borderRadius: 14,
    backgroundColor: "#ffffff",
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  progressGroupTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  progressGroupDescription: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  progressDayCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    padding: 11,
  },
  progressDayCardSaved: {
    borderColor: "#b8decf",
    backgroundColor: "#eefaf4",
  },
  progressDayHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  progressDayPill: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: colors.green,
  },
  progressDayPillText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  progressDayTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  progressDaySummary: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  progressEditButton: {
    borderRadius: 999,
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  progressEditButtonText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
  },
  progressEditor: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 12,
  },
  progressEditorLabel: {
    marginBottom: 8,
    marginTop: 8,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  progressChoiceGrid: {
    gap: 8,
  },
  progressChoice: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 15,
    backgroundColor: "#fbfefd",
    padding: 11,
  },
  progressChoiceSelected: {
    borderColor: colors.green,
    backgroundColor: colors.green,
  },
  progressChoiceTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  progressChoiceTitleSelected: {
    color: "#ffffff",
  },
  progressChoiceText: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  progressChoiceTextSelected: {
    color: "#eafff5",
  },
  progressEditorActions: {
    flexDirection: "row",
    gap: 9,
    marginTop: 14,
  },
  progressCancelButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: colors.greenSoft,
    paddingVertical: 12,
  },
  progressCancelButtonText: {
    color: colors.green,
    fontSize: 13,
    fontWeight: "900",
  },
  progressSaveButton: {
    flex: 1.4,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: colors.green,
    paddingVertical: 12,
  },
  progressSaveButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  vetDraftBox: {
    marginTop: 13,
    borderWidth: 1,
    borderColor: "#c8d9e8",
    borderRadius: 18,
    backgroundColor: "#f7fbff",
    padding: 13,
  },
  vetDraftEyebrow: {
    color: colors.green,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  vetDraftBadge: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#edf5f0",
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  vetDraftBadgeEnabled: {
    backgroundColor: colors.green,
    color: "#ffffff",
  },
  vetDraftIncludes: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 11,
  },
  vetDraftInclude: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  vetDraftActions: {
    gap: 9,
    marginTop: 12,
  },
  vetDraftPrimaryButton: {
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: colors.green,
    paddingVertical: 13,
  },
  vetDraftPrimaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  vetDraftSecondaryButton: {
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: colors.greenSoft,
    paddingVertical: 12,
  },
  vetDraftSecondaryButtonText: {
    color: colors.green,
    fontSize: 13,
    fontWeight: "900",
  },
  vetDraftPreview: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    padding: 13,
  },
  vetDraftSource: {
    color: colors.green,
    fontSize: 11,
    fontWeight: "900",
  },
  vetDraftOverview: {
    marginTop: 7,
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 20,
  },
  vetDraftHandoffLabel: {
    marginTop: 12,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  vetDraftHandoff: {
    marginTop: 5,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  vetDraftQuestion: {
    marginTop: 7,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  aiFeedbackBox: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 12,
  },
  aiFeedbackTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  aiFeedbackHint: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  aiFeedbackLabel: {
    marginBottom: 8,
    marginTop: 11,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  aiFeedbackScoreRow: {
    flexDirection: "row",
    gap: 6,
  },
  aiFeedbackScoreButton: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    backgroundColor: "#fbfefd",
    paddingVertical: 9,
  },
  aiFeedbackScoreButtonSelected: {
    borderColor: colors.green,
    backgroundColor: colors.green,
  },
  aiFeedbackScoreText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  aiFeedbackScoreTextSelected: {
    color: "#ffffff",
  },
  aiFeedbackPayRow: {
    gap: 7,
  },
  aiFeedbackPayButton: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: "#fbfefd",
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  aiFeedbackPayButtonSelected: {
    borderColor: colors.green,
    backgroundColor: colors.greenSoft,
  },
  aiFeedbackPayText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  aiFeedbackPayTextSelected: {
    color: colors.green,
  },
  aiFeedbackInputRow: {
    gap: 8,
    marginTop: 10,
  },
  aiFeedbackInput: {
    fontSize: 13,
  },
  aiFeedbackSaveButton: {
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: colors.green,
    marginTop: 10,
    paddingVertical: 12,
  },
  aiFeedbackSaveButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  episodePreviewBox: {
    marginTop: 13,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    padding: 13,
  },
  episodePreviewTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  episodePreviewText: {
    marginTop: 7,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  historyList: {
    gap: 10,
    marginTop: 12,
  },
  historyItem: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    backgroundColor: "#fbfefd",
    padding: 14,
  },
  historyItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  historyDate: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  historyRisk: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: colors.greenSoft,
    color: colors.green,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  historySummary: {
    marginTop: 9,
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
  },
  historyMeta: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  historyStorage: {
    marginTop: 8,
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
  },
  historyActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 10,
  },
  historyActionButton: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  historyActionText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
  },
  historyActionDanger: {
    color: colors.danger,
  },
  emptyText: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
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
