import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Application from "expo-application";
import * as AuthSession from "expo-auth-session";
import { useFonts } from "expo-font";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import type { User } from "@supabase/supabase-js";
import type { TextInputProps, TextProps, TextStyle } from "react-native";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
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
  defaultOAuthProviderStatus,
  fetchOAuthProviderStatus,
  hasLinkedProvider,
  oauthCallbackCode,
  oauthCallbackErrorMessage,
  oauthCallbackUrlErrorMessage,
  oauthLinkErrorMessage,
  oauthProviderLabels,
  oauthSignInErrorMessage,
  passwordAuthErrorMessage,
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
  isAllowedPetPhotoMimeType,
  maxReportMediaFiles,
  maxReportMediaSizeBytes,
  maxPetPhotoSizeBytes,
  petPhotoBucket,
  petPhotoExtensionFromMimeType,
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
  type VaccinationRecord,
} from "./src/lib/health";
import {
  hasVaccinationDraft,
  isMissingVaccinationTableError,
  toVaccinationRecord,
  vaccinationDraftFromRecords,
  vaccinationReminder,
  vaccinationSelectColumns,
  type VaccinationDraft,
  type VaccinationRow,
} from "./src/lib/vaccinations";

WebBrowser.maybeCompleteAuthSession();

const oauthRedirectTo = AuthSession.makeRedirectUri({
  scheme: "petflow",
  path: "auth-callback",
});
const oauthCallbackPrefixes = Array.from(
  new Set([oauthRedirectTo, "petflow://auth-callback", "petflow:///auth-callback"]),
);

function isOAuthCallbackUrl(url: string | null): url is string {
  return typeof url === "string" && oauthCallbackPrefixes.some((prefix) => url.startsWith(prefix));
}

type AuthMode = "login" | "signup";
type MainSection = "home" | "record" | "reports" | "account";

const mainSectionOptions: Array<{ id: MainSection; label: string }> = [
  { id: "home", label: "홈" },
  { id: "record", label: "기록" },
  { id: "reports", label: "보고서" },
  { id: "account", label: "계정" },
];

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

interface PetDraft extends Omit<PetProfile, "id"> {
  vaccination: VaccinationDraft;
  photoLocalUri?: string;
  photoMimeType?: string;
  photoFileName?: string;
  photoSizeBytes?: number;
  photoRemoved?: boolean;
}

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
type CheckScoreTone = "good" | "watch" | "alert" | "empty";

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

const emptyVaccinationDraft: VaccinationDraft = {
  name: "",
  administeredAt: "",
  dueAt: "",
  note: "",
};

const emptyPetDraft: PetDraft = {
  name: "",
  species: "dog",
  breed: "",
  birthDate: "",
  sex: "unknown",
  weight: "",
  photoPath: "",
  photoUrl: "",
  vaccination: emptyVaccinationDraft,
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

function petPhotoFileNameFromAsset(asset: ImagePicker.ImagePickerAsset, mimeType: string) {
  if (asset.fileName?.trim()) return cleanFileName(asset.fileName);
  const extension = petPhotoExtensionFromMimeType(mimeType);
  return cleanFileName(`petflow-photo-${Date.now()}.${extension}`);
}

async function createPetPhotoSignedUrl(photoPath?: string | null) {
  if (!photoPath) return "";
  const supabase = getSupabaseClient();
  if (!supabase) return "";
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
  const processedOAuthUrlsRef = useRef<Set<string>>(new Set());

  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [mainSection, setMainSection] = useState<MainSection>("home");
  const [enabledOAuthProviders, setEnabledOAuthProviders] = useState(
    defaultOAuthProviderStatus,
  );
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
  const [vaccinations, setVaccinations] = useState<VaccinationRecord[]>([]);
  const vaccinationTableAvailableRef = useRef(true);
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
  const selectedPetVaccinations = useMemo(
    () =>
      selectedPetId
        ? vaccinations.filter((record) => record.petId === selectedPetId)
        : [],
    [selectedPetId, vaccinations],
  );
  const healthFlow = useMemo(
    () => summarizeHealthFlow(selectedPetHistory, selectedPet?.name),
    [selectedPet?.name, selectedPetHistory],
  );
  const hasHealthDraft = useMemo(() => {
    if (!healthInput) return false;
    if (editingHealthRecord) return true;
    if (latestResult) return false;
    return Boolean(
      pendingMedia.length ||
        healthInput.symptoms.length ||
        healthInput.redFlags.length ||
        healthInput.appetite !== "normal" ||
        healthInput.energy !== "normal" ||
        healthInput.duration !== "today" ||
        healthInput.note.trim(),
    );
  }, [editingHealthRecord, healthInput, latestResult, pendingMedia.length]);

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (petFormExpanded) {
        setPetFormExpanded(false);
        return true;
      }
      if (mainSection !== "home") {
        setMainSection("home");
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [mainSection, petFormExpanded]);

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
  const activeEpisodeGroup = episodeReportGroups.find(
    (group) => group.episode?.status === "open",
  );

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
    return "필수 계정 정보를 확인해요";
  }, [authReady, configured, user]);

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
      setPetDraft({ ...emptyPetDraft, vaccination: emptyVaccinationDraft });
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
      setVaccinations([]);
      vaccinationTableAvailableRef.current = true;
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
        .select("id,name,species,breed,birth_date,sex,weight,photo_path,created_at")
        .eq("user_id", nextUser.id)
        .order("created_at", { ascending: true }),
    ]);

    if (error) {
      setMessage("계정 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
    let effectivePetRows: Array<{
      id: string;
      name: string;
      species: Species;
      breed: string | null;
      birth_date: string | null;
      sex: PetSex;
      weight: string | null;
      photo_path?: string | null;
    }> = petRows ?? [];
    let photoColumnReady = !petsError;
    if (isMissingPetPhotoColumnError(petsError)) {
      const { data: fallbackPets } = await supabase
        .from("pets")
        .select("id,name,species,breed,birth_date,sex,weight,created_at")
        .eq("user_id", nextUser.id)
        .order("created_at", { ascending: true });
      effectivePetRows = fallbackPets ?? [];
      photoColumnReady = false;
    } else if (petsError) {
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
    const loadedPets: PetProfile[] = await Promise.all(
      effectivePetRows.map(async (pet) => {
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
          photoUrl: await createPetPhotoSignedUrl(photoPath),
        };
      }),
    );
    setPets(loadedPets);
    await loadVaccinationsForPets(
      loadedPets.map((pet) => pet.id).filter((id): id is string => Boolean(id)),
    );
    setSelectedPetId((current) =>
      current && loadedPets.some((pet) => pet.id === current)
        ? current
        : loadedPets[0]?.id,
    );
    setPetFormExpanded(!loadedPets.length);
    if (!loadedPets.length) {
      setMainSection("home");
      setPetDraft({ ...emptyPetDraft, vaccination: emptyVaccinationDraft });
      setEditingPetId(null);
      setHealthInput(null);
      setLatestResult(null);
      setLatestEpisodeId(null);
      setEditingHealthRecord(null);
      setHistory([]);
      setEpisodes([]);
      setPlans([]);
      setProgress([]);
      setVaccinations([]);
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

  async function loadVaccinationsForPets(petIds: string[]) {
    const supabase = getSupabaseClient();
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
    petId: string,
    draft: VaccinationDraft,
  ): Promise<{ deletedId?: string; record?: VaccinationRecord; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase || !user) return {};
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
      user_id: user.id,
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

  async function uploadPetPhoto({
    petId,
    userId,
  }: {
    petId: string;
    userId: string;
  }) {
    const supabase = getSupabaseClient();
    if (
      !supabase ||
      !petDraft.photoLocalUri ||
      !petDraft.photoMimeType ||
      !isAllowedPetPhotoMimeType(petDraft.photoMimeType)
    ) {
      return "";
    }

    const uploadFile = new File(petDraft.photoLocalUri);
    const body = await uploadFile.arrayBuffer();
    if (body.byteLength <= 0 || body.byteLength > maxPetPhotoSizeBytes) {
      throw new Error("invalid pet photo size");
    }

    const extension = petPhotoExtensionFromMimeType(petDraft.photoMimeType);
    const storagePath = `${userId}/${petId}/${Date.now()}-${createUuid()}.${extension}`;
    const { error } = await supabase.storage
      .from(petPhotoBucket)
      .upload(storagePath, body, {
        cacheControl: "3600",
        contentType: petDraft.photoMimeType,
        upsert: false,
      });
    if (error) throw error;
    return storagePath;
  }

  const finishOAuthRedirect = useCallback(
    async (
      url: string | null,
      setErrorMessage: (message: string) => void,
    ): Promise<"completed" | "duplicate" | "failed" | "ignored"> => {
      if (!isOAuthCallbackUrl(url)) return "ignored";
      const callbackErrorMessage = oauthCallbackUrlErrorMessage(url);
      if (callbackErrorMessage) {
        setErrorMessage(callbackErrorMessage);
        return "failed";
      }
      if (processedOAuthUrlsRef.current.has(url)) return "duplicate";

      processedOAuthUrlsRef.current.add(url);
      const supabase = getSupabaseClient();
      if (!supabase) {
        processedOAuthUrlsRef.current.delete(url);
        setErrorMessage("Supabase 공개 환경변수를 먼저 설정해 주세요.");
        return "failed";
      }

      const authCode = oauthCallbackCode(url);
      if (!authCode) {
        processedOAuthUrlsRef.current.delete(url);
        setErrorMessage("로그인 확인 코드가 앱으로 돌아오지 않았어요. Google 또는 Apple로 다시 시작해 주세요.");
        return "failed";
      }

      const { error } = await supabase.auth.exchangeCodeForSession(authCode);
      if (error) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          const { data } = await supabase.auth.getUser();
          await loadAccount(data.user ?? null);
          return "completed";
        }

        processedOAuthUrlsRef.current.delete(url);
        setErrorMessage(oauthCallbackErrorMessage(error));
        return "failed";
      }

      const { data } = await supabase.auth.getUser();
      await loadAccount(data.user ?? null);
      return "completed";
    },
    [loadAccount],
  );

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
    let active = true;
    void fetchOAuthProviderStatus(
      process.env.EXPO_PUBLIC_SUPABASE_URL,
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ).then((status) => {
      if (active) setEnabledOAuthProviders(status);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;

    async function exchangeAuthUrl(url: string | null) {
      await finishOAuthRedirect(url, setMessage);
    }

    void Linking.getInitialURL().then(exchangeAuthUrl);
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void exchangeAuthUrl(url);
    });

    return () => subscription.remove();
  }, [finishOAuthRedirect]);

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

    if (error) return "계정 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";

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
              emailRedirectTo: oauthRedirectTo,
            },
          })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (result.error) {
      setMessage(passwordAuthErrorMessage(authMode, result.error));
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

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: oauthRedirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error || !data.url) {
        throw error ?? new Error("OAuth URL was not created.");
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, oauthRedirectTo);
      if (result.type === "success") {
        const status = await finishOAuthRedirect(result.url, setMessage);
        if (status === "completed" || status === "duplicate") {
          setMessage("");
        } else if (status === "ignored") {
          setMessage(`${oauthProviderLabels[provider]} 로그인이 완료되지 않았어요.`);
        }
        return;
      }

      if (result.type !== "cancel" && result.type !== "dismiss") {
        setMessage(`${oauthProviderLabels[provider]} 로그인이 완료되지 않았어요.`);
      }
    } catch (error) {
      setMessage(oauthSignInErrorMessage(provider, error));
    } finally {
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

    try {
      const { data, error } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo: oauthRedirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error || !data.url) {
        throw error ?? new Error("OAuth link URL was not created.");
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, oauthRedirectTo);
      if (result.type === "success") {
        const status = await finishOAuthRedirect(result.url, setLinkOauthMessage);
        if (status === "completed" || status === "duplicate") {
          setLinkOauthMessage(`${oauthProviderLabels[provider]} 계정을 연결했어요.`);
        } else if (status === "ignored") {
          setLinkOauthMessage(`${oauthProviderLabels[provider]} 연결이 완료되지 않았어요.`);
        }
        return;
      }

      if (result.type !== "cancel" && result.type !== "dismiss") {
        setLinkOauthMessage(`${oauthProviderLabels[provider]} 연결이 완료되지 않았어요.`);
      }
    } catch (error) {
      setLinkOauthMessage(oauthLinkErrorMessage(provider, error));
    } finally {
      setLinkOauthLoading(null);
    }
  }

  async function submitTesterProfile() {
    setLoading(true);
    const saveMessage = await saveTesterProfile();
    setMessage(saveMessage || "계정 정보가 저장됐어요.");
    setLoading(false);
  }

  async function signOut() {
    const supabase = getSupabaseClient();
    setLoading(true);
    try {
      await supabase?.auth.signOut();
    } finally {
      await loadAccount(null);
      setLoading(false);
    }
  }

  async function performAccountDeletion() {
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
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("request failed");

      setAccountDeletionRequested(true);
      setAccountDeletionMessage("계정 탈퇴가 완료됐어요. 현재 기기에서 로그아웃합니다.");
      await supabase?.auth.signOut();
      await loadAccount(null);
      setMessage("계정 탈퇴가 완료됐어요.");
    } catch {
      setAccountDeletionMessage(
        "계정 탈퇴를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setAccountDeletionLoading(false);
    }
  }

  async function requestAccountDeletion() {
    if (accountDeletionRequested) return;

    Alert.alert(
      "계정 탈퇴",
      "계정, 함께하는 아이들, 건강 기록, 사진·영상, AI 요약 이용 기록이 삭제됩니다. 이 작업은 되돌리기 어려워요.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "탈퇴",
          style: "destructive",
          onPress: () => void performAccountDeletion(),
        },
      ],
    );
  }

  function startNewPet() {
    setEditingPetId(null);
    setPetDraft({ ...emptyPetDraft, vaccination: emptyVaccinationDraft });
    setPetFormExpanded(true);
    setPetMessage("");
  }

  function startEditingPet(pet: PetProfile) {
    setEditingPetId(pet.id ?? null);
    setPetFormExpanded(true);
    const petVaccinations = pet.id
      ? vaccinations.filter((record) => record.petId === pet.id)
      : [];
    setPetDraft({
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      birthDate: pet.birthDate,
      sex: pet.sex,
      weight: pet.weight,
      photoPath: pet.photoPath ?? "",
      photoUrl: pet.photoUrl ?? "",
      photoRemoved: false,
      vaccination: vaccinationDraftFromRecords(petVaccinations),
    });
    setPetMessage("");
  }

  function closePetForm() {
    setEditingPetId(null);
    setPetDraft({ ...emptyPetDraft, vaccination: emptyVaccinationDraft });
    setPetFormExpanded(false);
    setPetMessage("");
  }

  async function pickPetPhoto() {
    setPetMessage("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPetMessage("프로필 사진을 고르려면 사진 접근 권한이 필요해요.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.82,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    const mimeType = mimeTypeFromAsset(asset);
    if (!isAllowedPetPhotoMimeType(mimeType)) {
      setPetMessage("프로필 사진은 JPG, PNG, WEBP, HEIC 이미지만 사용할 수 있어요.");
      return;
    }
    if ((asset.fileSize ?? 0) > maxPetPhotoSizeBytes) {
      setPetMessage("프로필 사진은 5MB 이하로 올려 주세요.");
      return;
    }

    setPetDraft((current) => ({
      ...current,
      photoLocalUri: asset.uri,
      photoMimeType: mimeType,
      photoFileName: petPhotoFileNameFromAsset(asset, mimeType),
      photoSizeBytes: asset.fileSize ?? 0,
      photoUrl: asset.uri,
      photoRemoved: false,
    }));
  }

  function removePetPhoto() {
    setPetDraft((current) => ({
      ...current,
      photoLocalUri: undefined,
      photoMimeType: undefined,
      photoFileName: undefined,
      photoSizeBytes: undefined,
      photoUrl: "",
      photoRemoved: Boolean(current.photoPath),
    }));
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
      "삭제하면 병원 전달 요약에서도 빠져요.",
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
      if (hasHealthDraft) {
        setMainSection("record");
        return;
      }
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

    if (hasVaccinationDraft(petDraft.vaccination)) {
      if (!petDraft.vaccination.name.trim()) {
        setPetMessage("예방접종 이름을 입력해 주세요.");
        return;
      }
      if (!petDraft.vaccination.administeredAt && !petDraft.vaccination.dueAt) {
        setPetMessage("접종일 또는 다음 예정일 중 하나는 입력해 주세요.");
        return;
      }
      if (
        petDraft.vaccination.administeredAt &&
        !isDateInput(petDraft.vaccination.administeredAt)
      ) {
        setPetMessage("접종일은 YYYY-MM-DD 형식으로 입력해 주세요.");
        return;
      }
      if (petDraft.vaccination.dueAt && !isDateInput(petDraft.vaccination.dueAt)) {
        setPetMessage("다음 예정일은 YYYY-MM-DD 형식으로 입력해 주세요.");
        return;
      }
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
        setPetLoading(false);
        setPetMessage("반려동물 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
    }
    const error =
      saveResult.error && !isMissingPetPhotoColumnError(saveResult.error)
        ? saveResult.error
        : null;

    if (error || !data) {
      setPetLoading(false);
      setPetMessage("반려동물 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (!photoColumnReady && (petDraft.photoLocalUri || petDraft.photoRemoved)) {
      setPetLoading(false);
      setPetMessage("사진 저장 준비가 아직 완료되지 않았어요. 잠시 후 다시 시도해 주세요.");
      return;
    }

    let photoPath =
      photoColumnReady && "photo_path" in data
        ? (data.photo_path ?? petDraft.photoPath ?? "")
        : "";
    let photoUrl = photoColumnReady ? (petDraft.photoUrl ?? "") : "";
    const previousPhotoPath = photoPath;
    try {
      if (photoColumnReady && petDraft.photoRemoved && previousPhotoPath) {
        const { error: updateError } = await supabase
          .from("pets")
          .update({ photo_path: null, updated_at: new Date().toISOString() })
          .eq("id", data.id);
        if (updateError) throw updateError;
        await supabase.storage.from(petPhotoBucket).remove([previousPhotoPath]);
        photoPath = "";
        photoUrl = "";
      }

      if (photoColumnReady && petDraft.photoLocalUri) {
        const nextPhotoPath = await uploadPetPhoto({
          petId: data.id,
          userId: user.id,
        });
        const { error: updateError } = await supabase
          .from("pets")
          .update({ photo_path: nextPhotoPath, updated_at: new Date().toISOString() })
          .eq("id", data.id);
        if (updateError) {
          await supabase.storage.from(petPhotoBucket).remove([nextPhotoPath]);
          throw updateError;
        }
        if (previousPhotoPath) {
          await supabase.storage.from(petPhotoBucket).remove([previousPhotoPath]);
        }
        photoPath = nextPhotoPath;
        photoUrl = await createPetPhotoSignedUrl(nextPhotoPath);
      } else if (photoColumnReady && photoPath && !petDraft.photoRemoved) {
        photoUrl = await createPetPhotoSignedUrl(photoPath);
      }
    } catch {
      setPetLoading(false);
      setPetMessage("기본 정보는 저장했지만 사진은 저장하지 못했어요. 다시 시도해 주세요.");
      return;
    }

    const savedPet: PetProfile = {
      id: data.id,
      name: petDraft.name.trim(),
      species: petDraft.species,
      breed: petDraft.breed.trim(),
      birthDate: petDraft.birthDate.trim(),
      sex: petDraft.sex,
      weight: petDraft.weight.trim(),
      photoPath,
      photoUrl,
    };
    const vaccinationSave = await saveVaccinationForPet(data.id, petDraft.vaccination);
    if (vaccinationSave.error) {
      setPetLoading(false);
      setPetMessage(vaccinationSave.error);
      return;
    }
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
    setPetLoading(false);
    setPets((current) => {
      const exists = current.some((pet) => pet.id === data.id);
      return exists
        ? current.map((pet) => (pet.id === data.id ? savedPet : pet))
        : [...current, savedPet];
    });
    setSelectedPetId(data.id);
    setEditingPetId(null);
    setPetDraft({ ...emptyPetDraft, vaccination: emptyVaccinationDraft });
    setPetFormExpanded(false);
    setPetMessage("반려동물 정보가 저장됐어요.");
  }

  async function submitHealthCheck(overrideInput?: HealthCheckInput) {
    if (!selectedPet?.id || (!healthInput && !overrideInput)) {
      setHealthMessage("오늘 기록할 반려동물을 먼저 선택해 주세요.");
      return;
    }
    const petId = selectedPet.id;
    const sourceInput = overrideInput ?? (healthInput as HealthCheckInput);

    const input: HealthCheckInput = {
      ...sourceInput,
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
      setAiCodeMessage("추가 사용 코드를 입력해 주세요.");
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
      setAiCodeMessage("추가 사용 코드가 적용됐어요.");
    } catch (error) {
      setAiCodeMessage(
        error instanceof Error
          ? error.message
          : "추가 사용 코드를 적용하지 못했어요.",
      );
    } finally {
      setAiCodeLoading(false);
    }
  }

  async function createVetDraft(episodeId: string) {
    if (!aiAccess?.enabled) {
      setVetDraftNotice({
        episodeId,
        text:
          aiAccess?.reason === "monthly_limit"
            ? "이번 달 AI 요약 사용량을 모두 사용했어요."
            : "AI 요약 사용량을 확인하지 못했어요.",
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
        text: "AI 병원 요약을 만들었어요.",
        tone: "success",
      });
      const nextAccess = await fetchAiAccessStatus(accessToken);
      if (nextAccess) setAiAccess(nextAccess);
    } catch (error) {
      setVetDraftNotice({
        episodeId,
        text:
          error instanceof Error
            ? error.message
            : "AI 요약을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
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
        text: "AI 요약을 공유했어요.",
        tone: "success",
      });
    } catch {
      setVetDraftNotice({
        episodeId,
        text: "AI 요약 공유 창을 열지 못했어요.",
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
        text: "AI 요약 피드백을 저장했어요.",
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

  const appDescription = user
    ? "닉네임과 연락처를 한 번 확인하면 바로 기록할 수 있어요."
    : "기록과 사진을 안전하게 이어서 관리하려면 계정으로 시작해요.";
  const showPageIntro = !configured || !authReady || !user || needsTesterProfile;

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
      enabledOAuthProviders={enabledOAuthProviders}
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
              <Text style={styles.badgeText}>PET FLOW</Text>
              <Text style={styles.brandTagline}>관찰을 병원 준비로</Text>
            </View>
          </TouchableOpacity>

          {showPageIntro ? (
            <>
              <Text style={styles.title}>{headline}</Text>
              <Text style={styles.description}>{appDescription}</Text>
            </>
          ) : null}

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
                      activeEpisodeGroup={activeEpisodeGroup}
                      vaccinations={selectedPetVaccinations}
                      onEditPet={() => {
                        if (selectedPet) {
                          startEditingPet(selectedPet);
                        } else {
                          startNewPet();
                        }
                        setMainSection("record");
                      }}
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
                        onPickPhoto={pickPetPhoto}
                        onRemovePhoto={removePetPhoto}
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
                          key={`${selectedPet.id ?? "pet"}:${editingHealthRecord?.result.id ?? "new"}`}
                          input={healthInput}
                          loading={healthLoading}
                          mediaMessage={mediaMessage}
                          mediaUploadMessage={mediaUploadMessage}
                          message={healthMessage}
                          isEditing={Boolean(editingHealthRecord)}
                          pendingMedia={pendingMedia}
                          result={latestResult}
                          episodeId={latestEpisodeId}
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
                        onGoRecord={startHealthRecord}
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
              enabledOAuthProviders={enabledOAuthProviders}
              oauthLoading={oauthLoading}
              onOAuth={submitOAuth}
              onSubmit={submitAuth}
            />
          )}

          <Text style={styles.notice}>
            AI 요약과 비밀키는 앱이 아니라 서버에서만 관리합니다.
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
  activeEpisodeGroup,
  flow,
  history,
  latestResult,
  pets,
  selectedPet,
  vaccinations,
  onEditPet,
  onGoRecord,
  onGoReports,
}: {
  activeEpisodeGroup?: EpisodeReportGroup;
  flow: HealthFlowSummary;
  history: HistoryRecord[];
  latestResult: AnalysisResult | null;
  pets: PetProfile[];
  selectedPet?: PetProfile;
  vaccinations: VaccinationRecord[];
  onEditPet: () => void;
  onGoRecord: () => void;
  onGoReports: () => void;
}) {
  const latestRecord = history[0];
  const riskScore = latestResult?.riskScore ?? latestRecord?.result.riskScore;
  const checkScore = riskScore === undefined ? undefined : displayCheckScore(riskScore);
  const scoreTone = getCheckScoreTone(checkScore);
  const riskLevel = latestResult?.riskLevel ?? latestRecord?.result.riskLevel;
  const latestAt = latestResult?.createdAt ?? latestRecord?.result.createdAt;
  const petSummary = selectedPet
    ? [speciesLabel(selectedPet.species), selectedPet.breed].filter(Boolean).join(" · ")
    : "함께 볼 아이를 골라주세요";
  const vaccination = vaccinationReminder(vaccinations);
  const initialProgressCount =
    activeEpisodeGroup?.progress.filter((item) =>
      initialFollowUpDays.includes(item.followUpDay),
    ).length ?? 0;

  if (!pets.length) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardEyebrow}>WELCOME</Text>
        <Text style={styles.cardTitle}>함께할 아이를 먼저 알려주세요</Text>
        <Text style={styles.cardText}>
          이름과 종류만 저장하면 바로 기록할 수 있어요.
        </Text>
        <SecondaryButton label="첫 아이 등록" onPress={onGoRecord} />
      </View>
    );
  }

  return (
    <>
      <View style={styles.homePetCard}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>오늘 상태</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onGoRecord}
            style={styles.homePrimaryAction}
          >
            <Text style={styles.homePrimaryActionText}>기록하기</Text>
          </TouchableOpacity>
          <View style={styles.homeInlineStatusRow}>
            {vaccination ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={onEditPet}
              style={[
                  styles.homeInlineStatus,
                  vaccination.tone === "due" && styles.homeInlineStatusDue,
                  vaccination.tone === "overdue" && styles.homeInlineStatusOverdue,
              ]}
              >
                <Text style={styles.homeInlineStatusText} numberOfLines={1}>
                  {vaccination.label} · {vaccination.title}
                </Text>
              </TouchableOpacity>
            ) : null}
            {activeEpisodeGroup ? (
              <TouchableOpacity
                activeOpacity={0.86}
                onPress={onGoReports}
                style={styles.homeInlineStatus}
              >
                <Text style={styles.homeInlineStatusText} numberOfLines={1}>
                  진행 중 · 기록 {activeEpisodeGroup.records.length}회 · 경과{" "}
                  {Math.min(initialProgressCount, 3)}/3
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onEditPet}
          style={styles.homePetProfile}
        >
          <View style={styles.petPhotoSlot}>
            {selectedPet?.photoUrl ? (
              <Image source={{ uri: selectedPet.photoUrl }} style={styles.petPhotoSlotImage} />
            ) : (
              <Text style={styles.petPhotoSlotText}>
                {avatarLabel(selectedPet?.name ?? "펫")}
              </Text>
            )}
          </View>
          <View style={styles.homePetProfileNameRow}>
            <Text style={styles.homePetName} numberOfLines={1}>
              {selectedPet ? selectedPet.name : "반려동물"}
            </Text>
            <Text style={styles.homePetEdit}>{selectedPet ? "수정" : "등록"}</Text>
          </View>
          <Text style={styles.homePetMeta} numberOfLines={1}>
            {petSummary || "정보 없음"}
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.homeScoreCard,
          scoreTone === "good" && styles.homeScoreCardGood,
          scoreTone === "watch" && styles.homeScoreCardWatch,
          scoreTone === "alert" && styles.homeScoreCardAlert,
        ]}
      >
        <View style={styles.homeScoreTop}>
          <View style={styles.homeScoreCopy}>
            <Text style={styles.cardEyebrow}>현재 상태</Text>
            <Text style={styles.homeScoreTitle}>
              {riskLevel ? riskLabels[riskLevel] : "첫 기록 전"}
            </Text>
            <Text style={styles.homeMutedText}>
              {latestAt
                ? `${formatRecordedAt(latestAt)} · 최근 14일 ${flow.recordCount}회`
                : "기록을 시작해 주세요."}
            </Text>
            <Text style={styles.homeFlowHeadline} numberOfLines={1}>
              {flow.headline}
            </Text>
            <TouchableOpacity activeOpacity={0.85} onPress={onGoReports}>
              <Text style={styles.homeFlowLink}>건강 흐름 보기</Text>
            </TouchableOpacity>
          </View>
          <View
            style={[
              styles.homeScoreBadge,
              scoreTone === "good" && styles.homeScoreBadgeGood,
              scoreTone === "watch" && styles.homeScoreBadgeWatch,
              scoreTone === "alert" && styles.homeScoreBadgeAlert,
            ]}
          >
            <Text
              style={[
                styles.homeScoreValue,
                scoreTone === "watch" && styles.homeScoreValueWatch,
                scoreTone === "alert" && styles.homeScoreValueAlert,
              ]}
            >
              {checkScore ?? "--"}
            </Text>
            <Text
              style={[
                styles.homeScoreCaption,
                (scoreTone === "watch" || scoreTone === "alert") &&
                  styles.homeScoreCaptionDark,
              ]}
            >
              CHECK
            </Text>
          </View>
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
      <Text style={styles.cardTitle}>함께할 아이를 먼저 알려주세요</Text>
      <Text style={styles.cardText}>
        아이별 기록과 병원 전달 요약을 모아서 볼 수 있어요.
      </Text>
      <SecondaryButton label="아이 등록하기" onPress={onGoRecord} />
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
  enabledOAuthProviders,
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
  enabledOAuthProviders: Record<OAuthProvider, boolean>;
  oauthLoading: OAuthProvider | null;
  onOAuth: (provider: OAuthProvider) => Promise<void>;
  onSubmit: () => Promise<void>;
}) {
  const authBusy = loading || oauthLoading !== null;
  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const appleEnabled = enabledOAuthProviders.apple;

  return (
    <View style={styles.card}>
      <View style={styles.authTabs} accessibilityLabel="계정 시작 방법">
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

      <Text style={styles.cardTitle}>{mode === "login" ? "로그인" : "회원가입"}</Text>
      <Text style={styles.cardText}>
        {mode === "login"
          ? "사용하던 계정으로 기록을 이어서 확인해요."
          : "Google, Apple 또는 이메일 계정으로 새로 시작해요."}
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
            {oauthLoading === "google"
              ? "Google 확인 중..."
              : mode === "login"
                ? "Google 계정으로 로그인"
                : "Google 계정으로 회원가입"}
          </Text>
        </TouchableOpacity>
        {appleEnabled ? (
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={authBusy}
            onPress={() => void onOAuth("apple")}
            style={[
              styles.oauthButton,
              styles.oauthButtonDark,
              authBusy && styles.buttonDisabled,
            ]}
          >
            <Text style={[styles.oauthButtonMark, styles.oauthButtonMarkDark]}></Text>
            <Text style={[styles.oauthButtonText, styles.oauthButtonTextDark]}>
              {oauthLoading === "apple"
                ? "Apple 확인 중..."
                : mode === "login"
                  ? "Apple 계정으로 로그인"
                  : "Apple 계정으로 회원가입"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={styles.authHint}>
        Google은 확인된 이메일을 제공해요.
        {appleEnabled ? " Apple은 비공개 릴레이 이메일로 연결될 수 있어요." : ""}
      </Text>
      <Message text={message} />

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setShowEmailAuth((current) => !current)}
        style={styles.emailFallbackToggle}
      >
        <Text style={styles.emailFallbackText}>
          {showEmailAuth
            ? "이메일 입력 접기"
            : mode === "login"
              ? "이메일로 로그인"
              : "이메일로 회원가입"}
        </Text>
      </TouchableOpacity>

      {showEmailAuth ? (
        <View style={styles.emailFallbackPanel}>
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
            label={loading ? "확인 중..." : mode === "login" ? "로그인" : "회원가입"}
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
      <Text style={styles.cardTitle}>필수 계정 정보</Text>
      <Text style={styles.cardText}>
        닉네임과 연락용 010 번호를 저장해요. 인증번호는 보내지 않아요.
      </Text>
      <TesterFields draft={draft} setDraft={setDraft} />
      <Message text={message} />
      <PrimaryButton
        disabled={loading}
        label={loading ? "저장 중..." : "계정 정보 저장"}
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
  enabledOAuthProviders,
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
  enabledOAuthProviders: Record<OAuthProvider, boolean>;
  disabled: boolean;
  onChangeAiCode: (value: string) => void;
  onLinkOAuth: (provider: OAuthProvider) => Promise<void>;
  onRedeemAiCode: () => Promise<void>;
  onRequestAccountDeletion: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [showAiCode, setShowAiCode] = useState(false);
  const googleLinked = hasLinkedProvider(user, "google");
  const appleLinked = hasLinkedProvider(user, "apple");
  const appleEnabled = enabledOAuthProviders.apple || appleLinked;
  const linkDisabled = disabled || linkOauthLoading !== null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardEyebrow}>SIGNED IN</Text>
      <Text style={styles.cardTitle}>
        {testerProfile?.nickname || user.email || "사용자"}
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
              기존 이메일 계정에 Google 또는 Apple을 연결하면 기록과 AI 요약 이용 내역이
              그대로 이어져요.
            </Text>
          </View>
        </View>

        <View style={styles.identityProviderList}>
          <View style={styles.identityProviderRow}>
            <View style={styles.identityProviderCopy}>
              <Text style={styles.identityProviderName}>Google</Text>
              <Text
                style={[
                  styles.identityLinkBadge,
                  googleLinked && styles.identityLinkBadgeConnected,
                ]}
              >
                {googleLinked ? "연결됨" : "연결 전"}
              </Text>
            </View>
            {googleLinked ? (
              <Text style={styles.identityLinkSuccess}>이 계정으로 로그인할 수 있어요.</Text>
            ) : (
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={linkDisabled}
                onPress={() => void onLinkOAuth("google")}
                style={[
                  styles.identityLinkButton,
                  linkDisabled && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.identityLinkButtonText}>
                  {linkOauthLoading === "google" ? "연결 중" : "연결"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {appleEnabled ? (
            <View style={styles.identityProviderRow}>
              <View style={styles.identityProviderCopy}>
                <Text style={styles.identityProviderName}>Apple</Text>
                <Text
                  style={[
                    styles.identityLinkBadge,
                    appleLinked && styles.identityLinkBadgeConnected,
                  ]}
                >
                  {appleLinked ? "연결됨" : "연결 전"}
                </Text>
              </View>
              {appleLinked ? (
                <Text style={styles.identityLinkSuccess}>이 계정으로 로그인할 수 있어요.</Text>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={linkDisabled}
                  onPress={() => void onLinkOAuth("apple")}
                  style={[
                    styles.identityLinkButton,
                    linkDisabled && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.identityLinkButtonText}>
                    {linkOauthLoading === "apple" ? "연결 중" : "연결"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </View>

        {!googleLinked || (appleEnabled && !appleLinked) ? (
          <Text style={styles.identityLinkHelp}>
            기록이 나뉘지 않도록 먼저 기존 이메일 계정으로 로그인한 뒤 연결해 주세요.
          </Text>
        ) : null}

        <Message
          text={linkOauthMessage}
          tone={linkOauthMessage.includes("연결했어요") ? "success" : "error"}
        />
      </View>

      <View style={[styles.aiAccessBox, aiAccess?.enabled && styles.aiAccessBoxEnabled]}>
        <View style={styles.aiAccessHeader}>
          <View style={styles.cardHeaderText}>
            <Text style={styles.aiAccessTitle}>AI 병원 요약</Text>
            <Text style={styles.aiAccessText}>{aiAccessCopy(aiAccess)}</Text>
          </View>
          <Text
            style={[
              styles.aiAccessBadge,
              aiAccess?.enabled && styles.aiAccessBadgeEnabled,
            ]}
          >
            {!aiAccess
              ? "확인 중"
              : aiAccess.enabled
                ? "사용 가능"
                : aiAccess.reason === "monthly_limit"
                  ? "이번 달 완료"
                  : "확인 필요"}
          </Text>
        </View>

        {aiAccess && aiAccess.reason !== "unavailable" ? (
          <View style={styles.aiUsageRow}>
            <View style={styles.aiUsageItem}>
              <Text style={styles.aiUsageLabel}>이번 달</Text>
              <Text style={styles.aiUsageValue}>
                {aiAccess.usedThisMonth}/{aiAccess.monthlyReportLimit}회
              </Text>
            </View>
            <View style={styles.aiUsageItem}>
              <Text style={styles.aiUsageLabel}>남은 요약</Text>
              <Text style={styles.aiUsageValue}>{aiAccess.remainingThisMonth}회</Text>
            </View>
            <View style={styles.aiUsageItem}>
              <Text style={styles.aiUsageLabel}>이용 방식</Text>
              <Text style={styles.aiUsageValue}>
                {aiAccess.accessMode === "code"
                  ? aiAccess.codeLabel ?? "추가 사용권"
                  : "기본 제공"}
              </Text>
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setShowAiCode((current) => !current)}
          style={styles.aiCodeDisclosure}
        >
          <Text style={styles.aiCodeDisclosureText}>추가 사용 코드</Text>
          <Text style={styles.aiCodeDisclosureText}>
            {showAiCode ? "접기" : "열기"}
          </Text>
        </TouchableOpacity>

        {showAiCode ? (
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
                {aiCodeLoading ? "확인 중" : "코드 적용"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <Message
          text={aiCodeMessage}
          tone={aiCodeMessage === "추가 사용 코드가 적용됐어요." ? "success" : "error"}
        />
      </View>

      <View style={styles.accountDeletionBox}>
        <Text style={styles.accountDeletionTitle}>계정 탈퇴</Text>
        <Text style={styles.accountDeletionText}>
          탈퇴하면 계정과 함께하는 아이들, 건강 기록, 사진·영상, AI 요약 이용
          기록이 삭제되고 현재 기기에서 로그아웃합니다.
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
              ? "탈퇴 완료"
              : accountDeletionLoading
                ? "탈퇴 중"
                : "계정 탈퇴"}
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
      <AppBuildInfo />
    </View>
  );
}

function AppBuildInfo() {
  const version = Application.nativeApplicationVersion ?? "dev";
  const build = Application.nativeBuildVersion ?? "dev";
  const platform = Platform.OS === "ios" ? "iOS" : "Android";

  return (
    <View style={styles.buildInfo}>
      <Text style={styles.buildInfoText}>
        {platform} {version} · 빌드 {build}
      </Text>
    </View>
  );
}

function PetManager({
  draft,
  editingPetId,
  formExpanded,
  loading,
  message,
  onPickPhoto,
  onRemovePhoto,
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
  onPickPhoto: () => Promise<void>;
  onRemovePhoto: () => void;
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
              {selectedPet ? `${selectedPet.name} 중심으로 기록해요.` : "함께 볼 아이를 골라주세요."}
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
                  {pet.photoUrl ? (
                    <Image
                      source={{ uri: pet.photoUrl }}
                      style={styles.petAvatarImage}
                    />
                  ) : (
                    <Text style={styles.petAvatarText}>
                      {avatarLabel(pet.name)}
                    </Text>
                  )}
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
          onPickPhoto={onPickPhoto}
          onRemovePhoto={onRemovePhoto}
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
  onPickPhoto,
  onRemovePhoto,
  setDraft,
  onCancel,
  onSave,
}: {
  draft: PetDraft;
  editing: boolean;
  loading: boolean;
  onPickPhoto: () => Promise<void>;
  onRemovePhoto: () => void;
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
      <View style={styles.petPhotoEditor}>
        <View style={styles.petPhotoPreview}>
          {draft.photoUrl ? (
            <Image source={{ uri: draft.photoUrl }} style={styles.petPhotoPreviewImage} />
          ) : (
            <Text style={styles.petPhotoPreviewText}>
              {draft.name ? avatarLabel(draft.name) : "펫"}
            </Text>
          )}
        </View>
        <View style={styles.petPhotoCopy}>
          <Text style={styles.petPhotoTitle}>프로필 사진</Text>
          <Text style={styles.petPhotoText}>
            선택 사항이에요. 홈에서 아이를 더 빨리 알아볼 수 있어요.
          </Text>
          <View style={styles.petPhotoActions}>
            <TouchableOpacity activeOpacity={0.85} onPress={onPickPhoto} style={styles.photoButton}>
              <Text style={styles.photoButtonText}>사진 선택</Text>
            </TouchableOpacity>
            {draft.photoUrl || draft.photoPath ? (
              <TouchableOpacity activeOpacity={0.85} onPress={onRemovePhoto}>
                <Text style={styles.photoRemoveText}>사진 지우기</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
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

      <FieldLabel label="품종" />
      {breedSuggestions.length ? (
        <View style={styles.choicePanel}>
          <Text style={styles.choicePanelText}>자주 쓰는 품종</Text>
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

      <FieldLabel label="생일" />
      <View style={styles.choicePanel}>
        <Text style={styles.choicePanelText}>빠른 선택</Text>
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

      <FieldLabel label="성별·중성화" />
      <ChipGroup
        options={sexOptions}
        selected={draft.sex}
        onSelect={(sex) => setDraft({ ...draft, sex })}
      />

      <FieldLabel label="체중" />
      <TextInput
        maxLength={20}
        onChangeText={(weight) => setDraft({ ...draft, weight })}
        placeholder="예: 4.2kg"
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        value={draft.weight}
      />

      <View style={styles.vaccinationInline}>
        <View style={styles.vaccinationInlineHeader}>
          <View>
            <Text style={styles.vaccinationInlineTitle}>예방접종</Text>
            <Text style={styles.vaccinationInlineText}>
              접종 기록과 다음 병원 예정일을 함께 남겨요.
            </Text>
          </View>
          <Text style={styles.vaccinationInlineBadge}>
            {draft.vaccination.dueAt ? "일정 있음" : "선택"}
          </Text>
        </View>
        <FieldLabel label="접종명" />
        <TextInput
          maxLength={80}
          onChangeText={(name) =>
            setDraft({
              ...draft,
              vaccination: { ...draft.vaccination, name },
            })
          }
          placeholder="예: 종합백신, 광견병"
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          value={draft.vaccination.name}
        />
        <View style={styles.inlineDateGrid}>
          <View style={styles.inlineDateField}>
            <FieldLabel label="맞은 날" />
            <TextInput
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              onChangeText={(administeredAt) =>
                setDraft({
                  ...draft,
                  vaccination: { ...draft.vaccination, administeredAt },
                })
              }
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.placeholder}
              style={styles.input}
              value={draft.vaccination.administeredAt}
            />
          </View>
          <View style={styles.inlineDateField}>
            <FieldLabel label="다음 예정일" />
            <TextInput
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              onChangeText={(dueAt) =>
                setDraft({
                  ...draft,
                  vaccination: { ...draft.vaccination, dueAt },
                })
              }
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.placeholder}
              style={styles.input}
              value={draft.vaccination.dueAt}
            />
          </View>
        </View>
        <FieldLabel label="메모" />
        <TextInput
          maxLength={120}
          onChangeText={(note) =>
            setDraft({
              ...draft,
              vaccination: { ...draft.vaccination, note },
            })
          }
          placeholder="병원명이나 특이사항"
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          value={draft.vaccination.note}
        />
      </View>

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
  aiAccess: AiAccessStatus | null;
  vetDraft?: VetReviewDraft;
  vetDraftLoading: boolean;
  vetDraftNotice: EpisodeNotice | null;
  onPickMedia: () => Promise<void>;
  onRemoveMedia: (id: string) => void;
  setInput: (input: HealthCheckInput) => void;
  onSubmit: (overrideInput?: HealthCheckInput) => Promise<void>;
  onGoAccount: () => void;
  onCreateVetDraft: (episodeId: string) => Promise<void>;
  onShareVetDraft: (episodeId: string, draft: VetReviewDraft) => Promise<void>;
}) {
  const [detailsOpen, setDetailsOpen] = useState(isEditing);
  const showDetails = isEditing || detailsOpen;
  const allNormal =
    input.symptoms.length === 0 &&
    input.appetite === "normal" &&
    input.energy === "normal" &&
    input.duration === "today" &&
    input.redFlags.length === 0 &&
    !input.note;

  function markAsNormal() {
    const nextInput = resetToNormal(input);
    if (allNormal) {
      void onSubmit(nextInput);
      return;
    }
    setInput(nextInput);
    if (!isEditing) setDetailsOpen(false);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {isEditing ? "기록 수정" : "오늘 기록"}
      </Text>

      <TouchableOpacity
        activeOpacity={0.85}
        disabled={loading}
        onPress={markAsNormal}
        style={[styles.normalButton, loading && styles.buttonDisabled]}
      >
        <Text style={styles.normalButtonCheck}>{allNormal ? "✓" : "↺"}</Text>
        <Text style={styles.normalButtonTitle}>
          {allNormal ? "평소와 같음" : "평소 상태로 초기화"}
        </Text>
        {allNormal ? <Text style={styles.normalButtonState}>바로 기록</Text> : null}
      </TouchableOpacity>

      {!isEditing ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setDetailsOpen((current) => !current)}
          style={styles.detailToggleButton}
        >
          <Text style={styles.detailToggleTitle}>
            {showDetails ? "상세 입력 닫기" : "변화가 있어요"}
          </Text>
          <Text style={styles.detailToggleMark}>{showDetails ? "−" : "+"}</Text>
        </TouchableOpacity>
      ) : null}

      {showDetails ? (
        <View style={styles.healthDetailFields}>
          <FieldLabel label="증상" />
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

          <FieldLabel label="기간" />
          <ChipGroup
            options={durationOptions}
            selected={input.duration}
            onSelect={(duration) => setInput({ ...input, duration })}
          />

          <FieldLabel label="위험 신호" />
          <MultiChipGroup
            danger
            options={redFlagOptions}
            selected={input.redFlags}
            onToggle={(flag) =>
              setInput({ ...input, redFlags: toggleItem(input.redFlags, flag) })
            }
          />

          <FieldLabel label="메모" />
          <TextInput
            maxLength={1000}
            multiline
            onChangeText={(note) => setInput({ ...input, note })}
            placeholder="달라진 상황을 짧게 적어주세요."
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
        </View>
      ) : null}

      {showDetails ? (
        <PrimaryButton
          disabled={loading}
          label={
            loading
              ? "저장 중..."
              : isEditing
                ? "수정 저장"
                : "기록 저장"
          }
          onPress={() => onSubmit()}
        />
      ) : null}
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
          <Text style={styles.mediaTitle}>사진·영상</Text>
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
          0/{maxReportMediaFiles} · 파일당 50MB
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
  const checkScore = displayCheckScore(result.riskScore);
  return (
    <View style={[styles.resultCard, styles[`resultCard_${result.riskLevel}`]]}>
      <View style={styles.resultHeader}>
        <View>
          <Text style={styles.resultEyebrow}>CHECK SCORE</Text>
          <Text style={styles.resultScore}>{checkScore}</Text>
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
          <Text style={styles.planTitle}>AI 병원 요약</Text>
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
          {canUseAiDraft
            ? `${aiAccess?.remainingThisMonth ?? 0}회 남음`
            : aiAccess?.reason === "monthly_limit"
              ? "이번 달 완료"
              : "확인 필요"}
        </Text>
      </View>

      {!episodeId ? (
        <Text style={styles.planEmptyText}>
          서버에 저장되고 같은 건강 흐름에 연결된 기록에서 만들 수 있어요.
        </Text>
      ) : !canUseAiDraft ? (
        <>
          <Text style={styles.planEmptyText}>{aiAccessCopy(aiAccess)}</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onGoAccount}
            style={styles.vetDraftSecondaryButton}
          >
            <Text style={styles.vetDraftSecondaryButtonText}>추가 사용 코드</Text>
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
                    ? "AI 요약 다시 만들기"
                    : "AI 요약 만들기"}
              </Text>
            </TouchableOpacity>
            {vetDraft ? (
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={vetDraftLoading}
                onPress={() => void onShareVetDraft(episodeId, vetDraft)}
                style={styles.vetDraftSecondaryButton}
              >
                <Text style={styles.vetDraftSecondaryButtonText}>요약 공유</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {vetDraft ? (
            <View style={styles.vetDraftPreview}>
              <Text style={styles.vetDraftSource}>
                {vetDraft.source === "openai" ? "AI 정리 · 확인 전" : "규칙 기반 정리"}
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
        AI 요약은 진단·처방·약물명·용량·치료 계획을 만들지 않으며 수의사 확인 전 자료로 표시됩니다.
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
  onGoRecord,
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
  onGoRecord: () => void;
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
  const shareGroups = useMemo(() => episodeGroups.slice(0, 4), [episodeGroups]);
  const [expandedReportKey, setExpandedReportKey] = useState<string | null>(null);
  const [recentOpen, setRecentOpen] = useState(false);
  const activeReportKey =
    shareGroups.some((group) => group.key === expandedReportKey)
        ? expandedReportKey
        : null;

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

  if (!history.length) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>아직 기록이 없어요</Text>
        <SecondaryButton label="첫 기록 시작" onPress={onGoRecord} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>건강 흐름</Text>
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
        <Text style={styles.flowWindow}>최근 14일 · {flow.recordCount}회</Text>
        <Text style={styles.flowTitle}>{flow.headline}</Text>
      </View>

      <Message text={message} />

      {shareGroups.length ? (
        <View style={styles.episodeList}>
          {shareGroups.map((group) => {
            const expanded = activeReportKey === group.key;
            return (
              <EpisodeReportItem
                aiAccess={aiAccess}
                aiFeedbackDraft={getAiFeedbackDraft(
                  group.episode ? vetDrafts[group.episode.id] : undefined,
                )}
                aiFeedbackNotice={aiFeedbackNotice}
                aiFeedbackSavingUsageId={aiFeedbackSavingUsageId}
                editingPlanEpisodeId={editingPlanEpisodeId}
                expanded={expanded}
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
                onToggleReport={() =>
                  setExpandedReportKey(expanded ? null : group.key)
                }
              />
            );
          })}
        </View>
      ) : (
        <Text style={styles.emptyText}>아직 기록이 없어요.</Text>
      )}
      <Message text={shareMessage} tone="success" />

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setRecentOpen((current) => !current)}
        style={styles.compactSectionToggle}
      >
        <Text style={styles.compactSectionToggleTitle}>최근 기록 {history.length}회</Text>
        <Text style={styles.compactSectionToggleAction}>
          {recentOpen ? "접기" : "보기"}
        </Text>
      </TouchableOpacity>
      {recentOpen && recent.length ? (
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
      ) : null}
    </View>
  );
}

function EpisodeReportItem({
  aiAccess,
  aiFeedbackDraft,
  aiFeedbackNotice,
  aiFeedbackSavingUsageId,
  editingPlanEpisodeId,
  expanded,
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
  onToggleReport,
}: {
  aiAccess: AiAccessStatus | null;
  aiFeedbackDraft: AiFeedbackDraft;
  aiFeedbackNotice: EpisodeNotice;
  aiFeedbackSavingUsageId: string | null;
  editingPlanEpisodeId: string | null;
  expanded: boolean;
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
  onToggleReport: () => void;
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
          onPress={onToggleReport}
          style={styles.episodeToggleButton}
        >
          <Text style={styles.episodeToggleButtonText}>
            {expanded ? "접기" : "보기"}
          </Text>
        </TouchableOpacity>
      </View>

      {expanded ? (
        <>
          <View style={styles.episodeExpandedActions}>
            <Text style={styles.episodeExpandedMeta} numberOfLines={1}>
              {planSummary} · 경과 {initialProgressCount + longTermProgressCount}회 · {mediaSummary}
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => void onShareReport(group.report)}
              style={styles.episodeShareButton}
            >
              <Text style={styles.episodeShareButtonText}>병원 요약 공유</Text>
            </TouchableOpacity>
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
              <Text style={styles.planTitle}>AI 병원 요약</Text>
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
              {canUseAiDraft
                ? `${aiAccess?.remainingThisMonth ?? 0}회 남음`
                : aiAccess?.reason === "monthly_limit"
                  ? "이번 달 완료"
                  : "확인 필요"}
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
            <Text style={styles.planEmptyText}>{aiAccessCopy(aiAccess)}</Text>
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
                        ? "AI 요약 다시 만들기"
                        : "AI 요약 만들기"}
                  </Text>
                </TouchableOpacity>
                {vetDraft ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={isCreatingVetDraft}
                    onPress={() => void onShareVetDraft(episodeId, vetDraft)}
                    style={styles.vetDraftSecondaryButton}
                  >
                    <Text style={styles.vetDraftSecondaryButtonText}>요약 공유</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {vetDraft ? (
                <View style={styles.vetDraftPreview}>
                  <Text style={styles.vetDraftSource}>
                    {vetDraft.source === "openai" ? "AI 정리 · 확인 전" : "규칙 기반 정리"}
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
                      <Text style={styles.aiFeedbackTitle}>사용자 피드백</Text>
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
            AI 요약은 진단·처방·약물명·용량·치료 계획을 만들지 않으며 수의사 확인
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
        </>
      ) : null}
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
  const media = record.media ?? [];
  const mediaSummary = formatReportMediaSummary(media);
  const checkScore = displayCheckScore(record.result.riskScore);
  const [mediaOpen, setMediaOpen] = useState(false);

  async function openAttachedMedia(item: ReportMediaAttachment) {
    if (!item.signedUrl) return;
    try {
      await Linking.openURL(item.signedUrl);
    } catch {
      Alert.alert("첨부를 열지 못했어요", "잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <View style={styles.historyItem}>
      <View style={styles.historyItemHeader}>
        <Text style={styles.historyDate}>{formatRecordedAt(record.result.createdAt)}</Text>
        <Text style={styles.historyRisk}>{riskLabels[record.result.riskLevel]}</Text>
      </View>
      <Text style={styles.historySummary}>{record.result.summary}</Text>
      <Text style={styles.historyMeta}>
        CHECK {checkScore} · {recordSymptomText(record)}
      </Text>
      <Text style={styles.historyMeta}>
        식욕 {optionLabel(levelOptions, record.input.appetite)} · 활력{" "}
        {optionLabel(levelOptions, record.input.energy)} ·{" "}
        {optionLabel(durationOptions, record.input.duration)}
      </Text>
      <View style={styles.historyStorageRow}>
        <Text style={styles.historyStorage}>
          {record.result.storage === "remote" ? "서버 저장" : "기기 내 결과"}
          {record.episodeId ? " · 사건 연결" : ""}
        </Text>
        {mediaSummary ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setMediaOpen((current) => !current)}
            style={styles.historyMediaButton}
          >
            <Text style={styles.historyMediaButtonText}>
              {mediaOpen ? `${mediaSummary} 접기` : `${mediaSummary} 보기`}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {mediaOpen ? (
        <View style={styles.historyMediaList}>
          {media.map((item) => (
            <TouchableOpacity
              activeOpacity={0.86}
              disabled={!item.signedUrl}
              key={item.id}
              onPress={() => void openAttachedMedia(item)}
              style={styles.historyMediaItem}
            >
              {item.kind === "image" && item.signedUrl ? (
                <Image source={{ uri: item.signedUrl }} style={styles.historyMediaThumb} />
              ) : (
                <View style={[styles.historyMediaThumb, styles.historyVideoThumb]}>
                  <Text style={styles.videoThumbText}>
                    {item.kind === "video" ? "영상" : "사진"}
                  </Text>
                </View>
              )}
              <View style={styles.historyMediaText}>
                <Text numberOfLines={1} style={styles.historyMediaFileName}>
                  {item.fileName}
                </Text>
                <Text style={styles.historyMediaFileMeta}>
                  {item.kind === "image" ? "사진" : "영상"} ·{" "}
                  {formatFileSize(item.sizeBytes)}
                  {item.signedUrl ? " · 탭해서 크게 보기" : ""}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
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
  if (!access) {
    return "AI 요약 사용량을 확인하고 있어요.";
  }
  if (access.reason === "unavailable") {
    return "사용량을 확인하지 못했어요. 잠시 후 다시 확인해 주세요.";
  }
  if (access.reason === "monthly_limit") {
    return "이번 달 AI 요약 사용량을 모두 사용했어요.";
  }
  if (access.reason === "total_limit") {
    return "추가 사용 코드의 전체 사용량을 모두 사용했어요.";
  }
  if (access.reason === "revoked") {
    return "추가 사용 코드가 만료됐어요.";
  }
  return "기록을 수의사가 보기 좋은 병원용 요약으로 정리해요.";
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

function displayCheckScore(riskScore: number) {
  if (!Number.isFinite(riskScore)) return 0;
  return Math.max(0, Math.min(100, Math.round(100 - riskScore)));
}

function getCheckScoreTone(checkScore?: number): CheckScoreTone {
  if (checkScore === undefined) return "empty";
  if (checkScore >= 70) return "good";
  if (checkScore >= 45) return "watch";
  return "alert";
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
    padding: 20,
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
    justifyContent: "space-between",
    gap: 14,
    marginTop: 24,
    borderWidth: 1,
    borderColor: "#d8eadf",
    borderRadius: 26,
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingVertical: 17,
    shadowColor: "#0a3027",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 20,
    elevation: 3,
  },
  homePetProfile: {
    width: 104,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.82)",
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.58)",
    padding: 9,
  },
  homePetProfileNameRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 7,
  },
  homePetName: {
    flex: 1,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  homePetMeta: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
  },
  homePetEdit: {
    flexShrink: 0,
    overflow: "hidden",
    borderRadius: 999,
    color: colors.green,
    backgroundColor: "#e6f6ee",
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: "900",
  },
  homeInlineStatusRow: {
    alignItems: "flex-start",
    gap: 6,
    marginTop: 8,
  },
  homeInlineStatus: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    borderWidth: 1,
    borderColor: "#cfe7dc",
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  homeInlineStatusDue: {
    borderColor: "#efd79d",
    backgroundColor: "#fff9ec",
  },
  homeInlineStatusOverdue: {
    borderColor: "#e6b5a8",
    backgroundColor: "#fff4ef",
  },
  homeInlineStatusText: {
    color: colors.green,
    fontSize: 10,
    fontWeight: "900",
  },
  petPhotoSlot: {
    width: 72,
    height: 72,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.78)",
    borderRadius: 24,
    backgroundColor: "#fff4d6",
  },
  petPhotoSlotText: {
    color: colors.green,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.6,
    textAlign: "center",
  },
  petPhotoSlotImage: {
    width: "100%",
    height: "100%",
  },
  homeScoreCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#bfe5d1",
    borderRadius: 26,
    backgroundColor: "#f5fcf8",
    padding: 17,
  },
  homeScoreCardGood: {
    borderColor: "#b8decf",
    backgroundColor: "#f1fbf5",
  },
  homeScoreCardWatch: {
    borderColor: "#efd79d",
    backgroundColor: "#fff9ec",
  },
  homeScoreCardAlert: {
    borderColor: "#e6b5a8",
    backgroundColor: "#fff4ef",
  },
  homeScoreTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  homeScoreCopy: {
    flex: 1,
    minWidth: 0,
  },
  homeScoreTitle: {
    marginTop: 7,
    color: colors.ink,
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 25,
  },
  homeScoreBadge: {
    width: 90,
    minHeight: 82,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: colors.ink,
    paddingVertical: 10,
  },
  homeScoreBadgeGood: {
    backgroundColor: "#164d42",
  },
  homeScoreBadgeWatch: {
    backgroundColor: "#fff4d6",
  },
  homeScoreBadgeAlert: {
    backgroundColor: "#fff0ea",
  },
  homeScoreValue: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 38,
  },
  homeScoreValueWatch: {
    color: "#8b6220",
  },
  homeScoreValueAlert: {
    color: colors.danger,
  },
  homeScoreCaption: {
    marginTop: 1,
    color: "rgba(255, 255, 255, 0.82)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  homeScoreCaptionDark: {
    color: colors.muted,
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
    alignItems: "center",
    marginTop: 12,
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
  homeFlowHeadline: {
    marginTop: 7,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
  },
  homeFlowLink: {
    marginTop: 8,
    color: colors.green,
    fontSize: 11,
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
    gap: 8,
  },
  choicePanelText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
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
  identityProviderList: {
    gap: 8,
    marginTop: 12,
  },
  identityProviderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  identityProviderCopy: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  identityProviderName: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
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
  aiCodeDisclosure: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(23, 76, 65, 0.1)",
    paddingTop: 11,
  },
  aiCodeDisclosureText: {
    color: colors.green,
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
  buildInfo: {
    marginTop: 12,
    alignItems: "center",
  },
  buildInfoText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.1,
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
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: colors.greenSoft,
  },
  petAvatarImage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    height: "100%",
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
  petPhotoEditor: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    backgroundColor: "#fbfefd",
    padding: 12,
  },
  petPhotoPreview: {
    width: 72,
    height: 72,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.78)",
    borderRadius: 24,
    backgroundColor: "#fff4d6",
  },
  petPhotoPreviewImage: {
    width: "100%",
    height: "100%",
  },
  petPhotoPreviewText: {
    color: colors.green,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  petPhotoCopy: {
    flex: 1,
    minWidth: 0,
  },
  petPhotoTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  petPhotoText: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  petPhotoActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 9,
  },
  photoButton: {
    borderRadius: 999,
    backgroundColor: "#edf5f0",
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  photoButtonText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
  },
  photoRemoveText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  vaccinationInline: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    padding: 13,
  },
  vaccinationInlineHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  vaccinationInlineTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  vaccinationInlineText: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  vaccinationInlineBadge: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: colors.greenSoft,
    color: colors.green,
    fontSize: 10,
    fontWeight: "900",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  inlineDateGrid: {
    flexDirection: "row",
    gap: 10,
  },
  inlineDateField: {
    flex: 1,
    minWidth: 0,
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
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.green,
    borderRadius: 18,
    backgroundColor: "#eefaf4",
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  normalButtonCheck: {
    width: 34,
    height: 34,
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: colors.green,
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 34,
    textAlign: "center",
  },
  normalButtonTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  normalButtonState: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#d9f3e6",
    color: colors.green,
    paddingHorizontal: 9,
    paddingVertical: 6,
    fontSize: 10,
    fontWeight: "900",
  },
  detailToggleButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    backgroundColor: "#fbfefd",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  detailToggleTitle: {
    color: colors.green,
    fontSize: 14,
    fontWeight: "900",
  },
  detailToggleMark: {
    color: colors.green,
    fontSize: 18,
    fontWeight: "900",
  },
  healthDetailFields: {
    marginTop: 4,
  },
  textarea: {
    minHeight: 94,
  },
  mediaBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    backgroundColor: "#f8fcfa",
    padding: 12,
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
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 22,
    padding: 15,
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
  flowWindow: {
    alignSelf: "flex-start",
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
  episodeToggleButton: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  episodeToggleButtonText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
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
  episodeExpandedActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 13,
  },
  episodeExpandedMeta: {
    flex: 1,
    minWidth: 0,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  compactSectionToggle: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    backgroundColor: "#fbfefd",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  compactSectionToggleTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  compactSectionToggleAction: {
    color: colors.green,
    fontSize: 11,
    fontWeight: "900",
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
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
  },
  historyStorageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
    marginTop: 8,
  },
  historyMediaButton: {
    borderRadius: 999,
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  historyMediaButtonText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
  },
  historyMediaList: {
    gap: 8,
    marginTop: 10,
  },
  historyMediaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    padding: 9,
  },
  historyMediaThumb: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.greenSoft,
  },
  historyVideoThumb: {
    alignItems: "center",
    justifyContent: "center",
  },
  historyMediaText: {
    flex: 1,
    minWidth: 0,
  },
  historyMediaFileName: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  historyMediaFileMeta: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
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
  notice: {
    marginTop: 18,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    textAlign: "center",
  },
});
