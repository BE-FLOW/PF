import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  defaultOAuthProviderStatus,
  fetchOAuthProviderStatus,
  hasLinkedProvider,
  isOAuthCallbackUrl,
  oauthCallbackCode,
  oauthCallbackErrorMessage,
  oauthCallbackUrlErrorMessage,
  oauthLinkErrorMessage,
  oauthProviderLabels,
  oauthSignInErrorMessage,
  passwordAuthErrorMessage,
  type OAuthProvider,
} from "./src/lib/auth";
import {
  configureMobileBilling,
  getMobileBillingProduct,
  isMobileBillingAvailable,
  purchaseAiSummaryCredit,
  refreshAiSummaryPaymentStatus,
  resetMobileBillingCache,
  subscribeToMobileBillingUpdates,
  type MobileBillingProduct,
} from "./src/lib/billing";
import {
  recordMobileMonetizationEvent,
  syncBillingAccess,
  syncBillingAfterPurchase,
  type MonetizationContext,
  type MonetizationEventName,
} from "./src/lib/monetization";
import {
  buildFirstUseGuide,
  type FirstUseGuide,
} from "./src/lib/onboarding";
import {
  buildRecordCalendar,
  isRecordDateInRange,
  monthKeyFromDate,
  normalizeRecordDateRange,
  recordDateKeyToIso,
  shiftRecordMonth,
  toRecordDateKey,
} from "./src/lib/record-calendar";
import { getSupabaseClient, isSupabaseConfigured } from "./src/lib/supabase";
import {
  buildEpisodeReport,
  createUuid,
  dailyObservationOptions,
  durationOptions,
  formatFileSize,
  formatReportMediaSummary,
  levelOptions,
  hasDailyObservation,
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
  riskLabels,
  symptomDetailQuestions,
  symptomOptions,
  toggleDailyObservation,
  toggleSymptomDetail,
  type AiAccessStatus,
  type AiReportFeedbackInput,
  type AnalysisResult,
  type EpisodePlan,
  type EpisodeProgress,
  type EpisodeReport,
  type HealthCheckInput,
  type HistoryRecord,
  type PetEpisode,
  type PetProfile,
  type PetSex,
  type ReportMediaAttachment,
  type ReportMediaKind,
  type RiskLevel,
  type Species,
  type VetReviewDraft,
  type VaccinationRecord,
} from "./src/lib/health";
import {
  hasVaccinationDraft,
  isMissingVaccinationTableError,
  toVaccinationRecord,
  vaccinationDraftFromRecords,
  vaccinationSelectColumns,
  type VaccinationDraft,
  type VaccinationRow,
} from "./src/lib/vaccinations";
WebBrowser.maybeCompleteAuthSession();

const oauthRedirectTo = AuthSession.makeRedirectUri({
  scheme: "petflow",
  path: "auth-callback",
});

type AuthMode = "login" | "signup";
type MainSection = "home" | "record" | "reports" | "account";

const mainSectionOptions: Array<{ id: MainSection; label: string }> = [
  { id: "home", label: "홈" },
  { id: "record", label: "병원 준비" },
  { id: "reports", label: "전달본" },
  { id: "account", label: "계정" },
];

const quickGuideStoragePrefix = "petflow-quick-guide-v2";
const billingPendingStoragePrefix = "petflow-billing-pending-v1";

function quickGuideStorageKey(userId: string) {
  return `${quickGuideStoragePrefix}:${userId}`;
}

function billingPendingStorageKey(userId: string) {
  return `${billingPendingStoragePrefix}:${userId}`;
}

async function readPendingBillingMinimum(userId: string) {
  try {
    const rawValue = await AsyncStorage.getItem(billingPendingStorageKey(userId));
    if (!rawValue) return null;
    const value = JSON.parse(rawValue) as { minimumCredits?: unknown };
    return Number.isInteger(value.minimumCredits) &&
      Number(value.minimumCredits) > 0 &&
      Number(value.minimumCredits) <= 100
      ? Number(value.minimumCredits)
      : null;
  } catch {
    return null;
  }
}

async function savePendingBillingMinimum(userId: string, minimumCredits: number) {
  await AsyncStorage.setItem(
    billingPendingStorageKey(userId),
    JSON.stringify({ minimumCredits }),
  );
}

async function clearPendingBillingMinimum(userId: string) {
  await AsyncStorage.removeItem(billingPendingStorageKey(userId));
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const iosPasswordRules =
  "minlength: 8; maxlength: 64; required: lower; required: upper; required: digit; required: special;";
const passwordPolicy = [
  { id: "length", label: "8~64자", test: (value: string) => value.length >= 8 && value.length <= 64 },
  { id: "lower", label: "영문 소문자", test: (value: string) => /[a-z]/.test(value) },
  { id: "upper", label: "영문 대문자", test: (value: string) => /[A-Z]/.test(value) },
  { id: "number", label: "숫자 포함", test: (value: string) => /\d/.test(value) },
  { id: "special", label: "특수문자 포함", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

interface AccountProfile {
  nickname: string;
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

interface EpisodeNotice {
  episodeId: string | null;
  text: string;
  tone: NoticeTone;
}

type VetDraftMap = Record<string, VetReviewDraft>;

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

const aiFeedbackScoreOptions: Array<{
  id: AiReportFeedbackInput["usefulnessScore"];
  label: string;
}> = [
  { id: 5, label: "도움됨" },
  { id: 3, label: "보통" },
  { id: 1, label: "아쉬움" },
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
  return sortHistory([...otherPets, ...remoteRecords]);
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
};

const petFlowFontFamilies = {
  regular: "Pretendard-Regular",
  semibold: "Pretendard-SemiBold",
  bold: "Pretendard-Bold",
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
  const [passwordRecoveryOpen, setPasswordRecoveryOpen] = useState(false);
  const [quickGuideOpen, setQuickGuideOpen] = useState(false);
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
  const [user, setUser] = useState<User | null>(null);
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [pets, setPets] = useState<PetProfile[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string | undefined>();
  const [petDraft, setPetDraft] = useState<PetDraft>(emptyPetDraft);
  const [petFormExpanded, setPetFormExpanded] = useState(false);
  const [editingPetId, setEditingPetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [petLoading, setPetLoading] = useState(false);
  const [petMessage, setPetMessage] = useState("");
  const [healthInput, setHealthInput] = useState<HealthCheckInput | null>(null);
  const [recordDateKey, setRecordDateKey] = useState(() =>
    toRecordDateKey(new Date()),
  );
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
  const accountLoadSequenceRef = useRef(0);
  const historyLoadSequenceRef = useRef(0);
  const submissionAttemptRef = useRef<{
    fingerprint: string;
    requestId: string;
  } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyResolvedPetId, setHistoryResolvedPetId] = useState<string | null>(null);
  const [historyMessage, setHistoryMessage] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [editingPlanEpisodeId, setEditingPlanEpisodeId] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState("");
  const [planSavingEpisodeId, setPlanSavingEpisodeId] = useState<string | null>(null);
  const [planNotice, setPlanNotice] = useState<EpisodeNotice>({
    episodeId: null,
    text: "",
    tone: "success",
  });
  const [aiAccess, setAiAccess] = useState<AiAccessStatus | null>(null);
  const [billingProduct, setBillingProduct] =
    useState<MobileBillingProduct | null>(null);
  const [billingProductLoading, setBillingProductLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingPurchasePending, setBillingPurchasePending] = useState(false);
  const [billingMessage, setBillingMessage] = useState("");
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [billingContext, setBillingContext] =
    useState<MonetizationContext>("report");
  const billingPendingMinimumCreditsRef = useRef<number | null>(null);
  const billingOperationInFlightRef = useRef(false);
  const pendingAiDraftRef = useRef<{
    episodeId: string;
    reportIds?: string[];
  } | null>(null);

  async function continuePendingAiDraft(access?: AiAccessStatus | null) {
    if (!access?.enabled || access.availableCredits < 1) return false;
    const pendingDraft = pendingAiDraftRef.current;
    if (!pendingDraft) return false;

    // Store updates can arrive more than once. Clear first so one purchase creates once.
    pendingAiDraftRef.current = null;
    setBillingModalOpen(false);
    setBillingMessage("");
    await createVetDraft(
      pendingDraft.episodeId,
      pendingDraft.reportIds,
      true,
    );
    return true;
  }

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
  const [aiFeedbackSavingUsageId, setAiFeedbackSavingUsageId] =
    useState<string | null>(null);
  const [aiFeedbackNotice, setAiFeedbackNotice] = useState<EpisodeNotice>({
    episodeId: null,
    text: "",
    tone: "success",
  });
  const [savedAiFeedbackUsageIds, setSavedAiFeedbackUsageIds] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    let removeBillingListener: (() => void) | null = null;
    if (!user?.id) {
      void resetMobileBillingCache();
      setBillingProduct(null);
      setBillingProductLoading(false);
      setBillingPurchasePending(false);
      setBillingMessage("");
      setBillingModalOpen(false);
      billingPendingMinimumCreditsRef.current = null;
      pendingAiDraftRef.current = null;
      return () => {
        active = false;
      };
    }
    if (!isMobileBillingAvailable()) {
      setBillingProduct(null);
      setBillingProductLoading(false);
      return () => {
        active = false;
      };
    }

    billingPendingMinimumCreditsRef.current = null;
    setBillingPurchasePending(false);
    setBillingMessage("");
    setBillingProduct(null);
    setBillingProductLoading(true);
    void configureMobileBilling(user.id)
      .then(async () => {
        const persistedMinimum = await readPendingBillingMinimum(user.id);
        if (persistedMinimum !== null) {
          billingPendingMinimumCreditsRef.current = persistedMinimum;
          if (active) {
            setBillingPurchasePending(true);
            setBillingMessage(
              "이전 결제 내역을 확인하고 있어요. 중복 결제 없이 반영만 진행해요.",
            );
          }
        }

        const applySyncedAccess = async (
          access: AiAccessStatus | null | undefined,
        ) => {
          if (!access) return;
          if (active) setAiAccess(access);
          const minimumCredits = billingPendingMinimumCreditsRef.current;
          if (minimumCredits === null) {
            if (active) await continuePendingAiDraft(access);
            return;
          }
          if (access.availableCredits < minimumCredits) {
            return;
          }

          billingPendingMinimumCreditsRef.current = null;
          await clearPendingBillingMinimum(user.id).catch(() => undefined);
          if (!active) return;
          setBillingPurchasePending(false);
          setBillingMessage("결제가 반영됐어요.");
          await continuePendingAiDraft(access);
        };

        removeBillingListener = subscribeToMobileBillingUpdates(() => {
          void billingAccessToken()
            .then((accessToken) =>
              accessToken
                ? syncBillingAccess(apiBaseUrl, accessToken)
                : Promise.resolve(null),
            )
            .then((synced) => {
              void applySyncedAccess(synced?.access);
            })
            .catch(() => undefined);
        });

        const productRequest = getMobileBillingProduct(user.id);
        const purchaseRecovery = refreshAiSummaryPaymentStatus(user.id)
          .catch(() => undefined)
          .then(async () => {
            const accessToken = await billingAccessToken();
            if (!accessToken) return;
            const synced = await syncBillingAccess(apiBaseUrl, accessToken);
            await applySyncedAccess(synced.access);
          })
          .catch(() => undefined);

        const [product] = await Promise.all([productRequest, purchaseRecovery]);
        return product;
      })
      .then((product) => {
        if (active) {
          setBillingProduct(product);
          setBillingProductLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setBillingProduct(null);
          setBillingProductLoading(false);
        }
      });

    return () => {
      active = false;
      removeBillingListener?.();
    };
  }, [user?.id]);

  const resetAiFeedbackState = useCallback(() => {
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
          group.episode?.startedAt,
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
  useEffect(() => {
    let active = true;
    if (!authReady || !user) {
      return () => {
        active = false;
      };
    }
    if (pets.length > 0 && historyResolvedPetId !== selectedPet?.id) {
      return () => {
        active = false;
      };
    }

    void AsyncStorage.getItem(quickGuideStorageKey(user.id))
      .then((value) => {
        if (active) setQuickGuideOpen(value !== "seen");
      })
      .catch(() => {
        if (active) setQuickGuideOpen(true);
      });

    return () => {
      active = false;
    };
  }, [authReady, historyResolvedPetId, pets.length, selectedPet?.id, user]);

  function closeQuickGuide() {
    setQuickGuideOpen(false);
    if (user) {
      void AsyncStorage.setItem(quickGuideStorageKey(user.id), "seen");
    }
  }

  const firstUseGuide = useMemo(
    () =>
      buildFirstUseGuide({
        petCount: pets.length,
        petName: selectedPet?.name,
        recordCount: selectedPetHistory.length,
      }),
    [pets.length, selectedPet?.name, selectedPetHistory.length],
  );

  function startFromQuickGuide() {
    closeQuickGuide();
    if (firstUseGuide.action === "report") {
      setMainSection("reports");
      return;
    }
    startHealthRecord();
  }

  const headline = useMemo(() => {
    if (!configured) return "앱 환경을 먼저 연결해요";
    if (!authReady) return "계정 확인 중";
    if (!user) return "병원에서 반복 설명하지 않도록";
    return "펫플로우";
  }, [authReady, configured, user]);

  const loadAccount = useCallback(async (nextUser: User | null) => {
    const loadSequence = ++accountLoadSequenceRef.current;
    historyLoadSequenceRef.current += 1;
    submissionAttemptRef.current = null;
    setUser(nextUser);
    setMessage("");
    setPetMessage("");
    setHistory([]);
    setEpisodes([]);
    setPlans([]);
    setProgress([]);
    setVaccinations([]);
    setLatestResult(null);
    setLatestEpisodeId(null);
    setEditingHealthRecord(null);
    if (!nextUser) {
      setMainSection("home");
      setQuickGuideOpen(false);
      setAccountProfile(null);
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
      setHistoryResolvedPetId(null);
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
      setPlanNotice({ episodeId: null, text: "", tone: "success" });
      setAiAccess(null);
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
        .select("nickname")
        .eq("user_id", nextUser.id)
        .maybeSingle(),
      supabase
        .from("pets")
        .select("id,name,species,breed,birth_date,sex,weight,photo_path,created_at")
        .eq("user_id", nextUser.id)
        .order("created_at", { ascending: true }),
    ]);
    if (loadSequence !== accountLoadSequenceRef.current) return;

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
        }
      : null;

    setAccountProfile(profile);
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
    if (loadSequence !== accountLoadSequenceRef.current) return;
    setPets(loadedPets);
    await loadVaccinationsForPets(
      loadedPets.map((pet) => pet.id).filter((id): id is string => Boolean(id)),
      loadSequence,
    );
    if (loadSequence !== accountLoadSequenceRef.current) return;
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
      setPlanNotice({ episodeId: null, text: "", tone: "success" });
      setVetDrafts({});
      setVetDraftLoadingEpisodeId(null);
      setVetDraftNotice({ episodeId: null, text: "", tone: "success" });
      resetAiFeedbackState();
      setPendingMedia([]);
      setMediaMessage("");
      setMediaUploadMessage("");
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const nextAiAccess = sessionData.session?.access_token
        ? await fetchAiAccessStatus(sessionData.session.access_token)
        : null;
      if (loadSequence !== accountLoadSequenceRef.current) return;
      setAiAccess(nextAiAccess);
    } catch {
      setAiAccess(null);
    }
    setAuthReady(true);
  }, [resetAiFeedbackState]);

  const loadPetHistory = useCallback(async (pet: PetProfile) => {
    const petId = pet.id;
    if (!petId) return;
    const loadSequence = ++historyLoadSequenceRef.current;
    setHistoryResolvedPetId(null);
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
        records?: HistoryRecord[];
      };
      const remoteRecords = payload.records ?? [];
      if (loadSequence !== historyLoadSequenceRef.current) return;
      setHistory((current) => mergePetHistory(current, remoteRecords, petId));
      setEpisodes(payload.episodes ?? []);
      setPlans(payload.plans ?? []);
      setProgress(payload.progress ?? []);
    } catch {
      if (loadSequence === historyLoadSequenceRef.current) {
        setHistoryMessage("최근 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      if (loadSequence === historyLoadSequenceRef.current) {
        setHistoryResolvedPetId(petId);
        setHistoryLoading(false);
      }
    }
  }, []);

  async function loadVaccinationsForPets(
    petIds: string[],
    loadSequence = accountLoadSequenceRef.current,
  ) {
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
    if (loadSequence !== accountLoadSequenceRef.current) return;
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
    files,
    reportId,
  }: {
    accessToken: string;
    files: PendingMediaAsset[];
    reportId: string;
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
      const fileBodies: ArrayBuffer[] = [];
      const descriptors: Array<{
        fileName: string;
        mimeType: string;
        sizeBytes: number;
        kind: ReportMediaKind;
      }> = [];
      for (const item of files) {
        const uploadFile = new File(item.uri);
        const body = await uploadFile.arrayBuffer();
        if (body.byteLength <= 0 || body.byteLength > maxReportMediaSizeBytes) {
          throw new Error("invalid media size");
        }
        fileBodies.push(body);
        descriptors.push({
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: body.byteLength,
          kind: item.kind,
        });
      }
      const prepareResponse = await fetch(
        `${apiBaseUrl}/api/reports/${reportId}/media/upload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ files: descriptors }),
        },
      );
      const prepared = (await prepareResponse.json()) as {
        uploads?: Array<{ storagePath: string; token: string }>;
      };
      if (
        !prepareResponse.ok ||
        !prepared.uploads ||
        prepared.uploads.length !== files.length
      ) {
        throw new Error("media upload authorization failed");
      }

      for (const [index, item] of files.entries()) {
        const upload = prepared.uploads[index];
        const { error } = await supabase.storage
          .from(reportMediaBucket)
          .uploadToSignedUrl(upload.storagePath, upload.token, fileBodies[index], {
            cacheControl: "3600",
            contentType: item.mimeType,
          });
        if (error) throw error;
        uploadedPaths.push(upload.storagePath);
        registeredFiles.push({
          storagePath: upload.storagePath,
          ...descriptors[index],
        });
      }

      const response = await fetch(`${apiBaseUrl}/api/reports/${reportId}/media`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files: registeredFiles }),
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
  }: {
    petId: string;
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

    const { data: authData } = await supabase.auth.getSession();
    if (!authData.session) throw new Error("missing session");
    const prepareResponse = await fetch(
      `${apiBaseUrl}/api/pets/${petId}/photo-upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authData.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: `pet-photo-${petId}`,
          mimeType: petDraft.photoMimeType,
          sizeBytes: body.byteLength,
        }),
      },
    );
    const prepared = (await prepareResponse.json()) as {
      upload?: { storagePath: string; token: string };
    };
    if (!prepareResponse.ok || !prepared.upload) {
      throw new Error("pet photo upload authorization failed");
    }
    const storagePath = prepared.upload.storagePath;
    const { error } = await supabase.storage
      .from(petPhotoBucket)
      .uploadToSignedUrl(storagePath, prepared.upload.token, body, {
        cacheControl: "3600",
        contentType: petDraft.photoMimeType,
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
        setErrorMessage("서비스 연결이 준비되지 않았어요. 잠시 후 다시 시도해 주세요.");
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
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecoveryOpen(true);
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
    setPlanNotice({ episodeId: null, text: "", tone: "success" });
    setVetDrafts({});
    setVetDraftLoadingEpisodeId(null);
    setVetDraftNotice({ episodeId: null, text: "", tone: "success" });
    resetAiFeedbackState();
    setPendingMedia([]);
    setMediaMessage("");
    setMediaUploadMessage("");
    void loadPetHistory(selectedPet);
  }, [loadPetHistory, resetAiFeedbackState, selectedPet]);

  async function submitAuth() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setMessage("서비스 연결이 준비되지 않았어요. 잠시 후 다시 시도해 주세요.");
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

    setLoading(false);
  }

  async function requestPasswordReset() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setMessage("비밀번호 재설정 설정을 확인하고 있어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (!emailPattern.test(email.trim())) {
      setMessage("재설정 메일을 받을 이메일을 입력해 주세요.");
      return;
    }
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: oauthRedirectTo,
    });
    setLoading(false);
    setMessage(
      error
        ? "재설정 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요."
        : "입력한 이메일로 비밀번호 재설정 안내를 보냈어요.",
    );
  }

  async function completePasswordRecovery(nextPassword: string) {
    const supabase = getSupabaseClient();
    if (!supabase) return "비밀번호를 저장하지 못했어요. 다시 시도해 주세요.";
    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    if (error) return "비밀번호를 저장하지 못했어요. 재설정 메일부터 다시 시작해 주세요.";
    setPasswordRecoveryOpen(false);
    Alert.alert("비밀번호 변경 완료", "새 비밀번호로 로그인할 수 있어요.");
    return "";
  }

  async function submitOAuth(provider: OAuthProvider) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setMessage("서비스 연결이 준비되지 않았어요. 잠시 후 다시 시도해 주세요.");
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
      setLinkOauthMessage("서비스 연결이 준비되지 않았어요. 잠시 후 다시 시도해 주세요.");
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

  async function signOut() {
    const supabase = getSupabaseClient();
    setLoading(true);
    try {
      await supabase?.auth.signOut();
    } finally {
      setPasswordRecoveryOpen(false);
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
      if (user?.id) {
        await Promise.allSettled([
          AsyncStorage.removeItem(quickGuideStorageKey(user.id)),
          clearPendingBillingMinimum(user.id),
        ]);
      }
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
      "계정, 함께하는 아이들, 건강 기록, 사진·영상, 병원 전달본 이용 기록이 삭제됩니다. 이 작업은 되돌리기 어려워요.",
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

  async function pickMedia(source: "camera" | "library" = "library") {
    setMediaMessage("");
    const existingMediaCount = editingHealthRecord?.media?.length ?? 0;
    if (existingMediaCount + pendingMedia.length >= maxReportMediaFiles) {
      setMediaMessage(`사진·영상은 한 기록에 ${maxReportMediaFiles}개까지만 저장할 수 있어요.`);
      return;
    }

    const permission = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMediaMessage(
        source === "camera"
          ? "촬영하려면 카메라 권한이 필요해요."
          : "사진·영상을 고르려면 앨범 접근 권한이 필요해요.",
      );
      return;
    }

    const remaining = maxReportMediaFiles - existingMediaCount - pendingMedia.length;
    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          allowsMultipleSelection: true,
          mediaTypes: ["images", "videos"],
          quality: 0.8,
          selectionLimit: remaining,
        });
    if (result.canceled) return;

    const next: PendingMediaAsset[] = [];
    let nextMessage = "";
    for (const asset of result.assets) {
      if (
        existingMediaCount + pendingMedia.length + next.length >=
        maxReportMediaFiles
      ) {
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

  async function deleteExistingMedia(item: ReportMediaAttachment) {
    const recordId = editingHealthRecord?.result.id;
    if (!recordId || editingHealthRecord?.result.storage !== "remote") return;

    try {
      const supabase = getSupabaseClient();
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("missing session");

      const response = await fetch(
        `${apiBaseUrl}/api/reports/${recordId}/media/${item.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!response.ok) throw new Error("delete failed");

      const withoutMedia = (media: ReportMediaAttachment[] = []) =>
        media.filter((attachment) => attachment.id !== item.id);
      setEditingHealthRecord((current) =>
        current
          ? { ...current, media: withoutMedia(current.media) }
          : current,
      );
      setHistory((current) =>
        current.map((record) =>
          record.result.id === recordId
            ? { ...record, media: withoutMedia(record.media) }
            : record,
        ),
      );
      setMediaMessage("첨부 자료를 삭제했어요.");
    } catch {
      setMediaMessage("첨부 자료를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  function confirmDeleteExistingMedia(item: ReportMediaAttachment) {
    Alert.alert(
      "첨부 자료를 삭제할까요?",
      "이 기록과 병원 전달본에서 함께 빠져요.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () => void deleteExistingMedia(item),
        },
      ],
    );
  }

  function startHealthRecord(selectedDateKey?: string) {
    submissionAttemptRef.current = null;
    if (selectedPet) {
      setHealthInput(profileToHealthInput(selectedPet));
    }
    setRecordDateKey(
      typeof selectedDateKey === "string" && recordDateKeyToIso(selectedDateKey)
        ? selectedDateKey
        : toRecordDateKey(new Date()),
    );
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
    setRecordDateKey(toRecordDateKey(record.result.createdAt));
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
      "삭제하면 사실 요약과 병원 전달본에서도 빠져요.",
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
        const { error: removeError } = await supabase.storage
          .from(petPhotoBucket)
          .remove([previousPhotoPath]);
        if (removeError) throw removeError;
        const { error: updateError } = await supabase
          .from("pets")
          .update({ photo_path: null, updated_at: new Date().toISOString() })
          .eq("id", data.id);
        if (updateError) throw updateError;
        photoPath = "";
        photoUrl = "";
      }

      if (photoColumnReady && petDraft.photoLocalUri) {
        const nextPhotoPath = await uploadPetPhoto({
          petId: data.id,
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

  async function deletePetProfile() {
    if (!editingPetId || !user) return;
    setPetLoading(true);
    setPetMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("missing session");

      const response = await fetch(`${apiBaseUrl}/api/pets/${editingPetId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("delete failed");

      setPetFormExpanded(false);
      setEditingPetId(null);
      setPetDraft({ ...emptyPetDraft, vaccination: emptyVaccinationDraft });
      await loadAccount(user);
      setPetMessage("반려동물과 연결된 기록을 삭제했어요.");
    } catch {
      setPetMessage("반려동물을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPetLoading(false);
    }
  }

  function confirmDeletePetProfile() {
    if (!editingPetId) return;
    const petName = pets.find((pet) => pet.id === editingPetId)?.name ?? "이 아이";
    Alert.alert(
      `${petName}의 정보를 삭제할까요?`,
      "건강 기록, 사진·영상과 병원 전달본에 연결된 내용도 함께 삭제돼요.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () => void deletePetProfile(),
        },
      ],
    );
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
    const observedAt = recordDateKeyToIso(recordDateKey);
    if (!editingHealthRecord && !observedAt) {
      setHealthMessage("기록 날짜를 다시 확인해 주세요.");
      return;
    }
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

        if (editingHealthRecord.result.storage !== "remote") {
          throw new Error("record is not stored remotely");
        }
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

        if (pendingMedia.length) {
          try {
            const addedMedia = await uploadPendingMediaFiles({
              accessToken,
              files: pendingMedia,
              reportId: editingHealthRecord.result.id,
            });
            media = [...media, ...addedMedia];
            setMediaUploadMessage(
              media.length ? `${formatReportMediaSummary(media)} 저장됐어요.` : "",
            );
          } catch {
            setMediaUploadMessage("기록은 수정됐지만 새 사진·영상은 저장하지 못했어요.");
          }
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

      const requestFingerprint = JSON.stringify({ input, petId, recordDateKey });
      if (submissionAttemptRef.current?.fingerprint !== requestFingerprint) {
        submissionAttemptRef.current = {
          fingerprint: requestFingerprint,
          requestId: createUuid(),
        };
      }
      const requestId = submissionAttemptRef.current.requestId;
      const response = await fetch(`${apiBaseUrl}/api/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": requestId,
          "x-petflow-pet-id": petId,
          "x-petflow-observed-date": recordDateKey,
        },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error("analysis failed");
      const payload = (await response.json()) as AnalysisResult & {
        episodeId?: string | null;
      };
      const { episodeId, ...result } = payload;
      if (result.storage !== "remote" || !episodeId) {
        throw new Error("server did not confirm the saved record");
      }
      submissionAttemptRef.current = null;
      let media: ReportMediaAttachment[] = [];
      let mediaNotice = "";
      if (pendingMedia.length) {
        try {
          media = await uploadPendingMediaFiles({
            accessToken,
            files: pendingMedia,
            reportId: result.id,
          });
          mediaNotice = media.length
            ? `${formatReportMediaSummary(media)} 첨부도 함께 저장됐어요.`
            : "";
        } catch {
          mediaNotice =
            "기록은 저장됐지만 사진·영상 첨부는 저장하지 못했어요. 필요하면 새 기록에서 다시 첨부해 주세요.";
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
        recordDateKey === toRecordDateKey(new Date())
          ? "오늘 기록이 저장됐어요."
          : "선택한 날짜에 기록을 저장했어요.",
      );
    } catch {
      if (editingHealthRecord) {
        setHealthMessage("기록을 수정하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.");
      } else {
        setHealthMessage(
          "기록을 저장하지 못했어요. 입력 내용은 그대로 두었으니 네트워크를 확인하고 다시 시도해 주세요.",
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
      setShareMessage(
        "사실 요약을 공유했어요. 다녀온 뒤 들은 내용도 같은 흐름에 이어둘 수 있어요.",
      );
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

  async function billingAccessToken() {
    const supabase = getSupabaseClient();
    const { data } = supabase
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    return data.session?.access_token ?? null;
  }

  async function trackMonetizationEvent(
    eventName: MonetizationEventName,
    context: MonetizationContext,
  ) {
    if (Platform.OS !== "android" && Platform.OS !== "ios") return;
    const accessToken = await billingAccessToken();
    if (!accessToken) return;
    await recordMobileMonetizationEvent({
      accessToken,
      apiBaseUrl,
      event: {
        eventId: createUuid(),
        eventName,
        context,
        platform: Platform.OS,
        appVersion: Application.nativeApplicationVersion,
        appBuild: Application.nativeBuildVersion,
      },
    });
  }

  function openBillingForAiDraft(episodeId: string, reportIds?: string[]) {
    pendingAiDraftRef.current = { episodeId, reportIds };
    setBillingContext("report");
    setBillingMessage("");
    setBillingModalOpen(true);
    void trackMonetizationEvent("paywall_viewed", "report");
  }

  function openBillingFromAccount() {
    pendingAiDraftRef.current = null;
    setBillingContext("account");
    setBillingMessage("");
    setBillingModalOpen(true);
    void trackMonetizationEvent("paywall_viewed", "account");
  }

  function closeBillingModal() {
    if (billingLoading) return;
    setBillingModalOpen(false);
    pendingAiDraftRef.current = null;
    setBillingMessage("");
    void trackMonetizationEvent("paywall_closed", billingContext);
  }

  async function purchaseAiCredit() {
    if (
      !user?.id ||
      billingLoading ||
      billingPurchasePending ||
      billingOperationInFlightRef.current
    ) {
      return;
    }
    billingOperationInFlightRef.current = true;
    let storePurchaseCompleted = false;
    setBillingLoading(true);
    setBillingMessage("");
    try {
      const accessToken = await billingAccessToken();
      if (!accessToken) {
        setBillingMessage("로그인을 다시 확인해 주세요.");
        return;
      }
      const current = await syncBillingAccess(apiBaseUrl, accessToken);
      if (current.error || !current.access) {
        setBillingMessage(
          current.error ?? "결제 준비 상태를 확인하지 못했어요.",
        );
        return;
      }
      setAiAccess(current.access);
      if (!current.access.purchaseAvailable) {
        setBillingMessage(
          "현재 결제를 이용할 수 없어요. 앱을 최신 버전으로 업데이트한 뒤 다시 확인해 주세요.",
        );
        return;
      }
      const minimumCredits = current.access.availableCredits + 1;

      void trackMonetizationEvent("purchase_started", billingContext);
      const result = await purchaseAiSummaryCredit(user.id);
      if (result.status === "cancelled") {
        void trackMonetizationEvent("purchase_cancelled", billingContext);
        return;
      }
      if (result.status !== "purchased") {
        setBillingMessage(result.message);
        void trackMonetizationEvent("purchase_failed", billingContext);
        return;
      }
      storePurchaseCompleted = true;
      billingPendingMinimumCreditsRef.current = minimumCredits;
      await savePendingBillingMinimum(user.id, minimumCredits).catch(
        () => undefined,
      );
      setBillingPurchasePending(true);
      const synced = await syncBillingAfterPurchase(
        () => syncBillingAccess(apiBaseUrl, accessToken),
        minimumCredits,
      );
      if (synced.access) setAiAccess(synced.access);
      if (
        !synced.synced ||
        (synced.access?.availableCredits ?? 0) < minimumCredits
      ) {
        setBillingMessage(
          "결제는 완료됐어요. 스토어 반영이 늦어지고 있어 결제 반영 확인에서 다시 확인할 수 있어요.",
        );
        void trackMonetizationEvent("purchase_sync_delayed", billingContext);
        return;
      }

      billingPendingMinimumCreditsRef.current = null;
      await clearPendingBillingMinimum(user.id).catch(() => undefined);
      setBillingPurchasePending(false);
      const continued = await continuePendingAiDraft(synced.access);
      if (!continued) {
        setBillingModalOpen(false);
        setBillingMessage("");
      }
    } catch {
      setBillingMessage(
        storePurchaseCompleted
          ? "결제가 완료됐을 수 있어요. 결제 반영 확인을 눌러 주세요."
          : "결제 준비 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
      void trackMonetizationEvent("purchase_failed", billingContext);
    } finally {
      billingOperationInFlightRef.current = false;
      setBillingLoading(false);
    }
  }

  async function refreshAiCredits() {
    if (!user?.id || billingOperationInFlightRef.current) return;
    billingOperationInFlightRef.current = true;
    setBillingLoading(true);
    setBillingMessage("");
    try {
      const refreshed = await refreshAiSummaryPaymentStatus(user.id);
      if (!refreshed.refreshed) {
        setBillingMessage(refreshed.message);
        return;
      }
      const accessToken = await billingAccessToken();
      if (!accessToken) {
        setBillingMessage("로그인을 다시 확인해 주세요.");
        return;
      }
      const synced = await syncBillingAccess(apiBaseUrl, accessToken);
      if (synced.access) setAiAccess(synced.access);
      void trackMonetizationEvent("purchase_history_checked", billingContext);

      const pendingMinimum = billingPendingMinimumCreditsRef.current;
      if (
        pendingMinimum !== null &&
        (synced.access?.availableCredits ?? 0) >= pendingMinimum
      ) {
        billingPendingMinimumCreditsRef.current = null;
        await clearPendingBillingMinimum(user.id).catch(() => undefined);
        setBillingPurchasePending(false);
        const continued = await continuePendingAiDraft(synced.access);
        if (!continued) {
          setBillingMessage("");
          setBillingModalOpen(false);
        }
        return;
      }

      if (await continuePendingAiDraft(synced.access)) return;

      setBillingMessage(
        synced.error ??
          (synced.access?.availableCredits
            ? `병원 전달본 ${synced.access.availableCredits}회를 확인했어요.`
            : "추가로 확인된 병원 전달본 이용권이 없어요."),
      );
    } catch {
      setBillingMessage(
        "결제 반영 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      billingOperationInFlightRef.current = false;
      setBillingLoading(false);
    }
  }

  async function createVetDraft(
    episodeId: string,
    reportIds?: string[],
    accessConfirmed = false,
  ) {
    if (!accessConfirmed && !aiAccess?.enabled) {
      if (aiAccess?.reason === "no_credits") {
        if (aiAccess.purchaseAvailable) {
          openBillingForAiDraft(episodeId, reportIds);
        } else {
          setVetDraftNotice({
            episodeId,
            text: "결제 연결을 준비하고 있어요. 앱을 최신 버전으로 업데이트한 뒤 다시 확인해 주세요.",
            tone: "error",
          });
        }
        return false;
      }
      setVetDraftNotice({
        episodeId,
        text: "병원 전달본 이용 가능 여부를 확인하지 못했어요.",
        tone: "error",
      });
      return false;
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
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reportIds }),
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
        text: "병원 전달본을 만들었어요.",
        tone: "success",
      });
      const nextAccess = await fetchAiAccessStatus(accessToken);
      if (nextAccess) setAiAccess(nextAccess);
      return true;
    } catch (error) {
      setVetDraftNotice({
        episodeId,
        text:
          error instanceof Error
            ? error.message
            : "병원 전달본을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
        tone: "error",
      });
      return false;
    } finally {
      setVetDraftLoadingEpisodeId(null);
    }
  }

  async function shareVetDraft(episodeId: string, draft: VetReviewDraft) {
    try {
      const result = await Share.share({
        title: draft.title,
        message: draft.copyText,
      });
      if (result.action !== Share.sharedAction) return;
      void trackMonetizationEvent("ai_summary_shared", "report");
      setVetDraftNotice({
        episodeId,
        text: "전달본을 공유했어요. 다녀온 뒤 들은 내용을 한 줄로 이어둘 수 있어요.",
        tone: "success",
      });
    } catch {
      setVetDraftNotice({
        episodeId,
        text: "병원 전달본 공유 창을 열지 못했어요.",
        tone: "error",
      });
    }
  }

  async function saveAiFeedback(
    episodeId: string,
    draft: VetReviewDraft,
    usefulnessScore: AiReportFeedbackInput["usefulnessScore"],
  ) {
    const usageId = draft.usageId;
    if (!usageId) return;

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
          usefulnessScore,
        } satisfies AiReportFeedbackInput),
      });
      if (!response.ok) throw new Error("save feedback failed");

      setSavedAiFeedbackUsageIds((current) =>
        current.includes(usageId) ? current : [...current, usageId],
      );
      setAiFeedbackNotice({
        episodeId,
        text: "병원 전달본 피드백을 저장했어요.",
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
    ? "병원 가기 전 상황을 남기고 전달본을 준비해요."
    : "한 줄과 사진을 시작 시점과 변화 순서로 정리해요.";
  const showPageIntro = !configured || !authReady || !user;

  const accountCard = user ? (
    <AccountCard
      aiAccess={aiAccess}
      billingProduct={billingProduct}
      billingLoading={billingLoading}
      billingPurchasePending={billingPurchasePending}
      billingMessage={billingMessage}
      accountDeletionLoading={accountDeletionLoading}
      accountDeletionMessage={accountDeletionMessage}
      accountDeletionRequested={accountDeletionRequested}
      user={user}
      accountProfile={accountProfile}
      linkOauthLoading={linkOauthLoading}
      linkOauthMessage={linkOauthMessage}
      enabledOAuthProviders={enabledOAuthProviders}
      onSignOut={signOut}
      onLinkOAuth={linkOAuthIdentity}
      onRequestAccountDeletion={requestAccountDeletion}
      onOpenGuide={() => setQuickGuideOpen(true)}
      onPurchaseAiCredit={openBillingFromAccount}
      onRefreshAiCredits={refreshAiCredits}
      disabled={loading || billingLoading}
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
              <MainSectionTabs value={mainSection} onChange={changeMainSection} />
                  {mainSection === "home" ? (
                    <HomeDashboard
                      history={selectedPetHistory}
                      pets={pets}
                      selectedPet={selectedPet}
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
                        onDelete={confirmDeletePetProfile}
                        onNew={startNewPet}
                        onSave={savePetProfile}
                        onSelect={setSelectedPetId}
                      />
                      {selectedPet && healthInput ? (
                        <HealthRecorder
                          key={`${selectedPet.id ?? "pet"}:${editingHealthRecord?.result.id ?? "new"}:${recordDateKey}`}
                          input={healthInput}
                          recordDateKey={recordDateKey}
                          loading={healthLoading}
                          mediaMessage={mediaMessage}
                          mediaUploadMessage={mediaUploadMessage}
                          message={healthMessage}
                          isEditing={Boolean(editingHealthRecord)}
                          mediaEnabled={
                            !editingHealthRecord ||
                            editingHealthRecord.result.storage === "remote"
                          }
                          existingMedia={editingHealthRecord?.media ?? []}
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
                          onRemoveExistingMedia={confirmDeleteExistingMedia}
                          onRemoveMedia={removePendingMedia}
                          onStartNew={() => startHealthRecord()}
                          setInput={setHealthInput}
                          onSubmit={submitHealthCheck}
                          onCreateVetDraft={createVetDraft}
                          onShareVetDraft={shareVetDraft}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {mainSection === "reports" ? (
                    selectedPet ? (
                      <HealthHistoryCard
                        key={selectedPet.id}
                        aiAccess={aiAccess}
                        aiFeedbackNotice={aiFeedbackNotice}
                        aiFeedbackSavingUsageId={aiFeedbackSavingUsageId}
                        episodeGroups={episodeReportGroups}
                        history={selectedPetHistory}
                        loading={historyLoading}
                        message={historyMessage}
                        petName={selectedPet.name}
                        editingPlanEpisodeId={editingPlanEpisodeId}
                        planDraft={planDraft}
                        planSavingEpisodeId={planSavingEpisodeId}
                        planNotice={planNotice}
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
                        shareMessage={shareMessage}
                      />
                    ) : (
                      <ReportsEmptyState onGoRecord={startHealthRecord} />
                    )
                  ) : null}
              {mainSection === "account" ? accountCard : null}
            </>
          ) : (
            <AuthForm
              mode={authMode}
              setMode={setAuthMode}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              loading={loading}
              message={message}
              enabledOAuthProviders={enabledOAuthProviders}
              oauthLoading={oauthLoading}
              onOAuth={submitOAuth}
              onRequestPasswordReset={requestPasswordReset}
              onSubmit={submitAuth}
            />
          )}

        </ScrollView>
      </KeyboardAvoidingView>
      <QuickGuideModal
        guide={firstUseGuide}
        open={quickGuideOpen}
        onClose={closeQuickGuide}
        onStart={startFromQuickGuide}
      />
      <PasswordRecoveryModal
        open={passwordRecoveryOpen}
        onClose={() => setPasswordRecoveryOpen(false)}
        onComplete={completePasswordRecovery}
      />
      <AiBillingModal
        access={aiAccess}
        context={billingContext}
        loading={billingLoading}
        message={billingMessage}
        open={billingModalOpen}
        product={billingProduct}
        productLoading={billingProductLoading}
        purchasePending={billingPurchasePending}
        onClose={closeBillingModal}
        onPurchase={purchaseAiCredit}
        onRefresh={refreshAiCredits}
      />
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
      <Text style={styles.cardTitle}>서비스 연결을 준비하고 있어요</Text>
      <Text style={styles.cardText}>
        잠시 후 다시 시도해 주세요. 계속 보이면 앱을 최신 버전으로 업데이트해 주세요.
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
  history,
  pets,
  selectedPet,
  onEditPet,
  onGoRecord,
  onGoReports,
}: {
  history: HistoryRecord[];
  pets: PetProfile[];
  selectedPet?: PetProfile;
  onEditPet: () => void;
  onGoRecord: (dateKey?: string) => void;
  onGoReports: () => void;
}) {
  const petSummary = selectedPet
    ? [speciesLabel(selectedPet.species), selectedPet.breed].filter(Boolean).join(" · ")
    : "함께 볼 아이를 골라주세요";
  const hasHistory = history.length > 0;
  if (!pets.length) {
    return (
      <View style={styles.card}>
          <Text style={styles.cardEyebrow}>병원 가기 전 3분</Text>
        <Text style={styles.cardTitle}>이름과 종류만 먼저 알려주세요</Text>
        <Text style={styles.cardText}>
          등록 뒤 달라진 점 한 줄만 남기면 돼요.
        </Text>
        <PrimaryButton
          disabled={false}
          label="30초 등록 시작"
          onPress={() => onGoRecord()}
        />
      </View>
    );
  }

  return (
    <View style={styles.homePetCard}>
      <View style={styles.cardHeaderText}>
        <Text style={styles.cardEyebrow}>병원 가기 전 3분</Text>
        <Text style={styles.homePrepTitle}>
          {hasHistory
            ? `${selectedPet?.name ?? "반려동물"}의 새 변화만 이어주세요`
            : `${selectedPet?.name ?? "반려동물"}의 달라진 점을 남겨주세요`}
        </Text>
        <Text style={styles.homePrepText}>
          {hasHistory
            ? "이전 기록과 병원에서 들은 내용은 다음 전달본에 이어져요."
            : "한 줄과 사진만 남기세요. 첫 전달본은 무료예요."}
        </Text>
        <TouchableOpacity
          accessibilityLabel="병원 전달본 준비 시작"
          accessibilityRole="button"
          activeOpacity={0.85}
          onPress={() => onGoRecord()}
          style={styles.homePrimaryAction}
        >
          <Text style={styles.homePrimaryActionText}>
            {hasHistory ? "새 변화 이어서 남기기" : "3분 준비 시작"}
          </Text>
        </TouchableOpacity>
        {history.length ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onGoReports}
            style={styles.homeExistingRecordsLink}
          >
            <Text style={styles.homeExistingRecordsText}>
              기록 {history.length}개로 전달본 만들기 ›
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <TouchableOpacity
        accessibilityLabel={`${selectedPet?.name ?? "반려동물"} 정보 수정`}
        accessibilityRole="button"
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
      <Text style={styles.cardEyebrow}>병원 전달본</Text>
      <Text style={styles.cardTitle}>함께할 아이를 먼저 알려주세요</Text>
      <Text style={styles.cardText}>
        이름과 종류만 입력하면 바로 병원 준비를 시작할 수 있어요.
      </Text>
      <SecondaryButton label="등록하고 준비하기" onPress={onGoRecord} />
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
  loading,
  message,
  enabledOAuthProviders,
  oauthLoading,
  onOAuth,
  onRequestPasswordReset,
  onSubmit,
}: {
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  loading: boolean;
  message: string;
  enabledOAuthProviders: Record<OAuthProvider, boolean>;
  oauthLoading: OAuthProvider | null;
  onOAuth: (provider: OAuthProvider) => Promise<void>;
  onRequestPasswordReset: () => Promise<void>;
  onSubmit: () => Promise<void>;
}) {
  const authBusy = loading || oauthLoading !== null;
  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const appleEnabled = enabledOAuthProviders.apple;

  return (
    <View style={styles.card}>
      <View style={styles.authValuePreview}>
        <Text style={styles.authValueEyebrow}>PET FLOW · 3분 병원 준비</Text>
        <Text style={styles.authValueTitle}>한 줄과 사진이 병원 전달본이 돼요</Text>
        <View style={styles.valuePreviewRow}>
          <View style={styles.valuePreviewBlock}>
            <Text style={styles.valuePreviewLabel}>남기는 것</Text>
            <Text style={styles.valuePreviewText}>달라진 점 · 사진</Text>
          </View>
          <Text style={styles.valuePreviewArrow}>→</Text>
          <View style={[styles.valuePreviewBlock, styles.valuePreviewResult]}>
            <Text style={styles.valuePreviewLabel}>얻는 것</Text>
            <Text style={styles.valuePreviewText}>병원 전달본</Text>
          </View>
        </View>
      </View>

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
            placeholder="name@example.com"
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
            placeholder={mode === "signup" ? "8자 이상, 대·소문자·숫자·특수문자" : "비밀번호"}
            placeholderTextColor={colors.placeholder}
            passwordRules={mode === "signup" ? iosPasswordRules : undefined}
            secureTextEntry
            style={styles.input}
            textContentType={mode === "login" ? "password" : "newPassword"}
            value={password}
          />
          {mode === "signup" ? <PasswordChecklist password={password} /> : null}

          <PrimaryButton
            disabled={authBusy}
            label={loading ? "확인 중..." : mode === "login" ? "로그인" : "회원가입"}
            onPress={onSubmit}
          />
          {mode === "login" ? (
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={authBusy}
              onPress={() => void onRequestPasswordReset()}
              style={styles.passwordRecoveryLink}
            >
              <Text style={styles.passwordRecoveryLinkText}>
                비밀번호 재설정 메일 받기
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function PasswordRecoveryModal({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: (password: string) => Promise<string>;
}) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) {
      setPassword("");
      setMessage("");
      setLoading(false);
    }
  }, [open]);

  async function save() {
    if (!isStrongPassword(password)) {
      setMessage("비밀번호 조건을 모두 충족해 주세요.");
      return;
    }
    setLoading(true);
    const result = await onComplete(password);
    setLoading(false);
    setMessage(result);
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={open}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalKeyboard}
      >
        <View style={styles.quickGuideBackdrop}>
          <View
            accessibilityLabel="새 비밀번호 설정"
            accessibilityViewIsModal
            style={styles.passwordRecoveryDialog}
          >
            <Text style={styles.quickGuideEyebrow}>계정 복구</Text>
            <Text style={styles.quickGuideTitle}>새 비밀번호 설정</Text>
            <Text style={styles.cardText}>
              이메일 로그인에 사용할 새 비밀번호를 입력해 주세요.
            </Text>
            <TextInput
              autoCapitalize="none"
              maxLength={64}
              onChangeText={setPassword}
              placeholder="8자 이상, 대·소문자·숫자·특수문자"
              placeholderTextColor={colors.placeholder}
              passwordRules={iosPasswordRules}
              secureTextEntry
              style={styles.input}
              textContentType="newPassword"
              value={password}
            />
            <PasswordChecklist password={password} />
            <PrimaryButton
              disabled={loading}
              label={loading ? "저장 중..." : "새 비밀번호 저장"}
              onPress={save}
            />
            <Message text={message} />
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={loading}
              onPress={onClose}
              style={styles.billingLaterButton}
            >
              <Text style={styles.billingLaterText}>나중에</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AccountCard({
  aiAccess,
  billingProduct,
  billingLoading,
  billingPurchasePending,
  billingMessage,
  accountDeletionLoading,
  accountDeletionMessage,
  accountDeletionRequested,
  user,
  accountProfile,
  linkOauthLoading,
  linkOauthMessage,
  enabledOAuthProviders,
  disabled,
  onLinkOAuth,
  onRequestAccountDeletion,
  onOpenGuide,
  onPurchaseAiCredit,
  onRefreshAiCredits,
  onSignOut,
}: {
  aiAccess: AiAccessStatus | null;
  billingProduct: MobileBillingProduct | null;
  billingLoading: boolean;
  billingPurchasePending: boolean;
  billingMessage: string;
  accountDeletionLoading: boolean;
  accountDeletionMessage: string;
  accountDeletionRequested: boolean;
  user: User;
  accountProfile: AccountProfile | null;
  linkOauthLoading: OAuthProvider | null;
  linkOauthMessage: string;
  enabledOAuthProviders: Record<OAuthProvider, boolean>;
  disabled: boolean;
  onLinkOAuth: (provider: OAuthProvider) => Promise<void>;
  onRequestAccountDeletion: () => Promise<void>;
  onOpenGuide: () => void;
  onPurchaseAiCredit: () => void;
  onRefreshAiCredits: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const googleLinked = hasLinkedProvider(user, "google");
  const appleLinked = hasLinkedProvider(user, "apple");
  const appleEnabled = enabledOAuthProviders.apple || appleLinked;
  const linkDisabled = disabled || linkOauthLoading !== null;
  const complimentarySummaryAvailable =
    (aiAccess?.complimentaryCredits ?? 0) > 0;
  const canOfferPurchase = Boolean(
    billingProduct &&
      aiAccess &&
      aiAccess.purchaseAvailable &&
      aiAccess.reason !== "unavailable" &&
      !complimentarySummaryAvailable,
  );
  const accountName =
    accountProfile?.nickname?.trim() ||
    (typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "") ||
    (typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name.trim()
      : "") ||
    "내 계정";

  return (
    <View style={styles.card}>
      <Text style={styles.cardEyebrow}>내 계정</Text>
      <Text style={styles.cardTitle}>{accountName}</Text>
      <Text style={styles.cardText}>{user.email}</Text>

      <View style={styles.identityLinkBox}>
        <View style={styles.identityLinkHeader}>
          <View style={styles.cardHeaderText}>
            <Text style={styles.identityLinkTitle}>로그인 방법</Text>
            <Text style={styles.identityLinkText}>
              Google 또는 Apple을 연결해도 지금 계정의 기록과 이용 내역이 이어져요.
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
            연결은 선택 사항이며 현재 기록은 그대로 유지돼요.
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
            <Text style={styles.aiAccessTitle}>병원 전달본</Text>
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
                ? `${aiAccess.availableCredits}회`
                : aiAccess.reason === "no_credits"
                  ? "이용권 없음"
                  : "확인 필요"}
          </Text>
        </View>

        {aiAccess && aiAccess.reason !== "unavailable" ? (
          <View style={styles.aiUsageRow}>
            <View style={styles.aiUsageItem}>
              <Text style={styles.aiUsageLabel}>남은 요약</Text>
              <Text style={styles.aiUsageValue}>{aiAccess.availableCredits}회</Text>
            </View>
            <View style={styles.aiUsageItem}>
              <Text style={styles.aiUsageLabel}>완료한 요약</Text>
              <Text style={styles.aiUsageValue}>{aiAccess.usedTotal}회</Text>
            </View>
          </View>
        ) : null}

        {complimentarySummaryAvailable ? (
          <Text style={styles.aiTrialHint}>
            첫 전달본은 무료예요. 기록을 고른 뒤 병원 전달본을 만들어 보세요.
          </Text>
        ) : null}

        {canOfferPurchase && billingProduct ? (
          <View style={styles.aiBillingActions}>
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={billingLoading}
              onPress={onPurchaseAiCredit}
              style={[
                styles.aiBillingPrimary,
                billingLoading && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.aiBillingPrimaryText}>
                {billingPurchasePending
                  ? "결제 반영 확인"
                  : `${billingProduct.priceLabel} · 1회 추가`}
              </Text>
            </TouchableOpacity>
            {!billingPurchasePending ? (
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={billingLoading}
                onPress={() => void onRefreshAiCredits()}
                style={styles.aiBillingRestore}
              >
                <Text style={styles.aiBillingRestoreText}>결제 반영 확인</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        <Message
          text={billingMessage}
          tone={billingMessageTone(billingMessage)}
        />
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onOpenGuide}
        style={styles.quickGuideEntry}
      >
        <View style={styles.cardHeaderText}>
          <Text style={styles.quickGuideEntryTitle}>사용법 보기</Text>
          <Text style={styles.quickGuideEntryText}>
            기록부터 병원 전달본까지 한눈에 확인해요.
          </Text>
        </View>
        <Text style={styles.quickGuideEntryArrow}>›</Text>
      </TouchableOpacity>

      <View style={styles.accountDeletionBox}>
        <Text style={styles.accountDeletionTitle}>계정 탈퇴</Text>
        <Text style={styles.accountDeletionText}>
          탈퇴하면 계정과 함께하는 아이들, 건강 기록, 사진·영상, 병원 전달본 이용
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

function AiBillingModal({
  access,
  context,
  loading,
  message,
  open,
  product,
  productLoading,
  purchasePending,
  onClose,
  onPurchase,
  onRefresh,
}: {
  access: AiAccessStatus | null;
  context: MonetizationContext;
  loading: boolean;
  message: string;
  open: boolean;
  product: MobileBillingProduct | null;
  productLoading: boolean;
  purchasePending: boolean;
  onClose: () => void;
  onPurchase: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={open}
    >
      <View style={styles.quickGuideBackdrop}>
        <View
          accessibilityLabel="병원 전달본 1회 이용권"
          accessibilityViewIsModal
          style={styles.billingDialog}
        >
          <Text style={styles.quickGuideEyebrow}>병원 전달본 · 1회 이용권</Text>
          <Text style={styles.quickGuideTitle}>
            {context === "report"
              ? `지금 고른 기록을\n병원에서 바로 보여주세요`
              : `처음부터 다시 설명하지 않도록\n전달본 한 번`}
          </Text>
          <Text style={styles.billingDescription}>
            시작 시점과 변화 순서를 사실 중심으로 정리해요. 1회 결제이며 자동
            갱신은 없어요.
          </Text>

          {access?.availableCredits ? (
            <View style={styles.billingBalance}>
              <Text style={styles.billingBalanceLabel}>현재 이용 가능</Text>
              <Text style={styles.billingBalanceValue}>
                {access.availableCredits}회
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.86}
            accessibilityRole="button"
            disabled={
              loading ||
              (!purchasePending &&
                (productLoading || !product || !access?.purchaseAvailable))
            }
            onPress={() =>
              void (purchasePending ? onRefresh() : onPurchase())
            }
            style={[
              styles.quickGuideClose,
              (loading ||
                (!purchasePending &&
                  (productLoading || !product || !access?.purchaseAvailable))) &&
                styles.buttonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.quickGuideCloseText}>
                {purchasePending
                  ? "결제 반영 확인"
                  : product
                    ? access?.purchaseAvailable
                      ? `${product.priceLabel} · 1회 추가`
                      : "결제를 준비 중이에요"
                  : productLoading
                    ? "상품 확인 중"
                    : "결제를 준비 중이에요"}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.billingFootnote}>
            {purchasePending
              ? "결제는 끝났어요. 중복 결제 없이 이용권 반영만 확인해요."
              : "결제 후 바로 전달본을 이어서 만들어요. 진단이나 처방은 만들지 않아요."}
          </Text>

          {!purchasePending ? (
            <TouchableOpacity
              activeOpacity={0.8}
              accessibilityRole="button"
              disabled={loading}
              onPress={() => void onRefresh()}
              style={styles.billingSecondaryButton}
            >
              <Text style={styles.billingSecondaryText}>결제 반영 확인</Text>
            </TouchableOpacity>
          ) : null}

          <Message text={message} tone={billingMessageTone(message)} />

          <TouchableOpacity
            activeOpacity={0.8}
            accessibilityRole="button"
            disabled={loading}
            onPress={onClose}
            style={styles.billingLaterButton}
          >
            <Text style={styles.billingLaterText}>나중에</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function QuickGuideModal({
  guide,
  open,
  onClose,
  onStart,
}: {
  guide: FirstUseGuide;
  open: boolean;
  onClose: () => void;
  onStart: () => void;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={open}
    >
      <View style={styles.quickGuideBackdrop}>
        <View
          accessibilityLabel="펫플로우 처음 사용법"
          accessibilityViewIsModal
          style={styles.quickGuideDialog}
        >
          <Text style={styles.quickGuideEyebrow}>{guide.eyebrow}</Text>
          <Text style={styles.quickGuideTitle}>{guide.title}</Text>
          <Text style={styles.quickGuideDescription}>{guide.description}</Text>

          <View style={styles.quickGuideValueFlow}>
            <View style={styles.valuePreviewBlock}>
              <Text style={styles.valuePreviewLabel}>남기는 것</Text>
              <Text style={styles.valuePreviewText}>한 줄 · 사진</Text>
            </View>
            <Text style={styles.valuePreviewArrow}>→</Text>
            <View style={[styles.valuePreviewBlock, styles.valuePreviewResult]}>
              <Text style={styles.valuePreviewLabel}>얻는 것</Text>
              <Text style={styles.valuePreviewText}>병원 전달본</Text>
            </View>
          </View>
          <Text style={styles.quickGuideResult}>{guide.result}</Text>

          <TouchableOpacity
            activeOpacity={0.86}
            accessibilityRole="button"
            onPress={onStart}
            style={styles.quickGuideClose}
          >
            <Text style={styles.quickGuideCloseText}>{guide.actionLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            accessibilityRole="button"
            onPress={onClose}
            style={styles.quickGuideLater}
          >
            <Text style={styles.quickGuideLaterText}>홈 먼저 보기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
  onDelete,
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
  onDelete: () => void;
  onEdit: (pet: PetProfile) => void;
  onNew: () => void;
  onSave: () => Promise<void>;
  onSelect: (petId: string) => void;
}) {
  const selectedPet = pets.find((pet) => pet.id === selectedPetId);
  const showPetForm = formExpanded || !pets.length;

  if (!showPetForm && selectedPet) {
    return (
      <View style={[styles.card, styles.petContextCard]}>
        <View style={styles.petContextRow}>
          <View style={styles.petAvatar}>
            {selectedPet.photoUrl ? (
              <Image source={{ uri: selectedPet.photoUrl }} style={styles.petAvatarImage} />
            ) : (
              <Text style={styles.petAvatarText}>{avatarLabel(selectedPet.name)}</Text>
            )}
          </View>
          <View style={styles.petListText}>
            <Text style={styles.petName}>{selectedPet.name}</Text>
            <Text style={styles.petMeta}>{speciesLabel(selectedPet.species)}</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => onEdit(selectedPet)}
            style={styles.editButton}
          >
            <Text style={styles.editButtonText}>수정</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} onPress={onNew} style={styles.smallButton}>
            <Text style={styles.smallButtonText}>+ 추가</Text>
          </TouchableOpacity>
        </View>
        {pets.length > 1 ? (
          <ScrollView
            horizontal
            contentContainerStyle={styles.petSwitcher}
            showsHorizontalScrollIndicator={false}
          >
            {pets.map((pet) => (
              <TouchableOpacity
                activeOpacity={0.85}
                key={pet.id}
                onPress={() => pet.id && onSelect(pet.id)}
                style={[
                  styles.petSwitcherButton,
                  pet.id === selectedPetId && styles.petSwitcherButtonSelected,
                ]}
              >
                <Text
                  style={[
                    styles.petSwitcherText,
                    pet.id === selectedPetId && styles.petSwitcherTextSelected,
                  ]}
                >
                  {pet.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}
        <Message text={message} />
      </View>
    );
  }

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
          <Text style={styles.selectedPetLabel}>기록할 아이</Text>
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
          onDelete={editingPetId ? onDelete : undefined}
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
  onDelete,
  onSave,
}: {
  draft: PetDraft;
  editing: boolean;
  loading: boolean;
  onPickPhoto: () => Promise<void>;
  onRemovePhoto: () => void;
  setDraft: (draft: PetDraft) => void;
  onCancel?: () => void;
  onDelete?: () => void;
  onSave: () => Promise<void>;
}) {
  const breedSuggestions = breedOptions[draft.species];
  const birthDateShortcuts = useMemo(() => buildBirthDateShortcuts(), []);
  const selectedBreed = draft.breed.trim();
  const [detailsExpanded, setDetailsExpanded] = useState(editing);

  useEffect(() => {
    setDetailsExpanded(editing);
  }, [editing]);

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

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setDetailsExpanded((current) => !current)}
        style={styles.petDetailsToggle}
      >
        <Text style={styles.petDetailsToggleText}>
          {detailsExpanded ? "세부 정보 접기" : "사진·세부 정보 추가"}
        </Text>
        <Text style={styles.petDetailsToggleIcon}>{detailsExpanded ? "−" : "+"}</Text>
      </TouchableOpacity>

      {detailsExpanded ? (
        <>
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
            <Text style={styles.helperText}>모르면 비워둬도 괜찮아요.</Text>
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
                  접종일이나 다음 예정일이 있을 때만 남겨요.
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
        </>
      ) : null}

      <PrimaryButton
        disabled={loading}
        label={loading ? "저장 중..." : editing ? "수정 저장" : "등록하고 기록 시작"}
        onPress={onSave}
      />
      {onDelete ? (
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={loading}
          onPress={onDelete}
          style={styles.petDeleteButton}
        >
          <Text style={styles.petDeleteButtonText}>반려동물 삭제</Text>
        </TouchableOpacity>
      ) : null}
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
  recordDateKey,
  loading,
  mediaMessage,
  mediaUploadMessage,
  message,
  isEditing,
  mediaEnabled,
  existingMedia,
  pendingMedia,
  result,
  episodeId,
  aiAccess,
  vetDraft,
  vetDraftLoading,
  vetDraftNotice,
  onPickMedia,
  onRemoveExistingMedia,
  onRemoveMedia,
  onStartNew,
  setInput,
  onSubmit,
  onCreateVetDraft,
  onShareVetDraft,
}: {
  input: HealthCheckInput;
  recordDateKey: string;
  loading: boolean;
  mediaMessage: string;
  mediaUploadMessage: string;
  message: string;
  isEditing: boolean;
  mediaEnabled: boolean;
  existingMedia: ReportMediaAttachment[];
  pendingMedia: PendingMediaAsset[];
  result: AnalysisResult | null;
  episodeId: string | null;
  aiAccess: AiAccessStatus | null;
  vetDraft?: VetReviewDraft;
  vetDraftLoading: boolean;
  vetDraftNotice: EpisodeNotice | null;
  onPickMedia: (source: "camera" | "library") => Promise<void>;
  onRemoveExistingMedia: (item: ReportMediaAttachment) => void;
  onRemoveMedia: (id: string) => void;
  onStartNew: () => void;
  setInput: (input: HealthCheckInput) => void;
  onSubmit: (overrideInput?: HealthCheckInput) => Promise<void>;
  onCreateVetDraft: (episodeId: string, reportIds?: string[]) => Promise<boolean>;
  onShareVetDraft: (episodeId: string, draft: VetReviewDraft) => Promise<void>;
}) {
  const allNormal =
    input.symptoms.length === 0 &&
    input.appetite === "normal" &&
    input.energy === "normal" &&
    input.duration === "today" &&
    input.redFlags.length === 0 &&
    !input.note;
  const totalMediaCount = existingMedia.length + pendingMedia.length;
  const hasContent = !allNormal || totalMediaCount > 0;
  const recordDateTitle =
    recordDateKey === toRecordDateKey(new Date())
      ? "병원 가기 전 기록"
      : `${formatCalendarDate(recordDateKey)} 상황`;

  if (result && !isEditing) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>병원 전달 준비</Text>
        <Message text={message} />
        <Message text={mediaUploadMessage} tone="success" />
        <HealthResultCard
          aiAccess={aiAccess}
          episodeId={episodeId}
          result={result}
          vetDraft={vetDraft}
          vetDraftLoading={vetDraftLoading}
          vetDraftNotice={vetDraftNotice}
          onCreateVetDraft={onCreateVetDraft}
          onShareVetDraft={onShareVetDraft}
        />
        <SecondaryButton label="내용 더 남기기" onPress={onStartNew} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {isEditing ? "기록 수정" : "병원 가기 전 문진 준비"}
      </Text>
      {!isEditing && recordDateKey !== toRecordDateKey(new Date()) ? (
        <Text style={styles.cardText}>{recordDateTitle}</Text>
      ) : null}

      <View style={styles.recordComposer}>
        <Text style={styles.composerPrompt}>
          병원에서 꼭 말하고 싶은 변화는 무엇인가요?
        </Text>
        <TextInput
          maxLength={1000}
          multiline
          onChangeText={(note) => setInput({ ...input, note })}
          placeholder="예: 어제 저녁부터 밥을 안 먹고 두 번 토했어요."
          placeholderTextColor={colors.placeholder}
          style={[styles.input, styles.composerTextarea]}
          textAlignVertical="top"
          value={input.note}
        />

        <MediaPickerSection
          disabled={
            totalMediaCount >= maxReportMediaFiles || !mediaEnabled
          }
          existingMedia={existingMedia}
          mediaMessage={mediaMessage}
          onPickMedia={onPickMedia}
          onRemoveExistingMedia={onRemoveExistingMedia}
          onRemoveMedia={onRemoveMedia}
          pendingMedia={pendingMedia}
        />

        <View style={styles.composerSectionHeading}>
          <Text style={styles.composerSectionTitle}>해당하는 변화</Text>
          <Text style={styles.composerSectionHint}>필요한 것만 선택</Text>
        </View>
        <ScrollView
          horizontal
          contentContainerStyle={styles.observationChipRow}
          showsHorizontalScrollIndicator={false}
        >
          {dailyObservationOptions.map((option) => {
            const selected = hasDailyObservation(input, option.id);
            return (
              <TouchableOpacity
                activeOpacity={0.85}
                key={option.id}
                onPress={() => setInput(toggleDailyObservation(input, option.id))}
                style={[styles.chip, selected && styles.observationChipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.observationChipTextSelected]}>
                  {selected ? `✓ ${option.label}` : option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {input.symptoms.length ? (
          <View style={styles.symptomDetailsBox}>
            <View style={styles.composerSectionHeading}>
              <Text style={styles.composerSectionTitle}>문진에서 자주 묻는 내용</Text>
              <Text style={styles.composerSectionHint}>해당되는 것만 선택</Text>
            </View>
            {input.symptoms.map((symptom) => {
              const question = symptomDetailQuestions[symptom];
              const selected = new Set(input.symptomDetails?.[symptom] ?? []);
              return (
                <View key={symptom} style={styles.symptomDetailRow}>
                  <Text style={styles.symptomDetailPrompt}>{question.prompt}</Text>
                  <ScrollView
                    horizontal
                    contentContainerStyle={styles.observationChipRow}
                    showsHorizontalScrollIndicator={false}
                  >
                    {question.options.map((option) => {
                      const active = selected.has(option.id);
                      return (
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          activeOpacity={0.85}
                          key={option.id}
                          onPress={() =>
                            setInput(toggleSymptomDetail(input, symptom, option.id))
                          }
                          style={[
                            styles.chip,
                            active && styles.observationChipSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              active && styles.observationChipTextSelected,
                            ]}
                          >
                            {active ? `✓ ${option.label}` : option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              );
            })}
          </View>
        ) : null}

        {input.appetite !== "normal" ? (
          <View style={styles.composerDetailBlock}>
            <Text style={styles.composerDetailLabel}>식사량</Text>
            <ChipGroup
              options={levelOptions.filter((option) => option.id !== "normal")}
              selected={input.appetite}
              onSelect={(appetite) => setInput({ ...input, appetite })}
            />
          </View>
        ) : null}
        {input.energy !== "normal" ? (
          <View style={styles.composerDetailBlock}>
            <Text style={styles.composerDetailLabel}>활력</Text>
            <ChipGroup
              options={levelOptions.filter((option) => option.id !== "normal")}
              selected={input.energy}
              onSelect={(energy) => setInput({ ...input, energy })}
            />
          </View>
        ) : null}

        <View style={styles.composerDetailBlock}>
          <Text style={styles.composerDetailLabel}>언제부터</Text>
          <ChipGroup
            options={durationOptions.map((option) => ({
              ...option,
              label: option.id === "today" ? "오늘" : option.label,
            }))}
            selected={input.duration}
            onSelect={(duration) => setInput({ ...input, duration })}
          />
        </View>

        {input.redFlags.length ? (
          <Text style={styles.legacySafetyText}>
            기존 기록의 위험 신호 {input.redFlags.length}개가 유지됩니다.
          </Text>
        ) : null}
        <Text style={styles.composerSafetyText}>
          호흡 곤란·의식 저하·경련·지속 출혈은 기록보다 병원 연락이 먼저예요.
        </Text>
      </View>

      <PrimaryButton
        disabled={loading || (!isEditing && !hasContent)}
        label={
          loading
            ? "저장 중..."
            : isEditing
              ? "수정 저장"
              : "저장하고 전달본 보기"
        }
        onPress={() => onSubmit()}
      />
      <Message text={message} />
      <Message text={mediaUploadMessage} tone="success" />

    </View>
  );
}

function MediaPickerSection({
  disabled = false,
  existingMedia,
  mediaMessage,
  onPickMedia,
  onRemoveExistingMedia,
  onRemoveMedia,
  pendingMedia,
}: {
  disabled?: boolean;
  existingMedia: ReportMediaAttachment[];
  mediaMessage: string;
  onPickMedia: (source: "camera" | "library") => Promise<void>;
  onRemoveExistingMedia: (item: ReportMediaAttachment) => void;
  onRemoveMedia: (id: string) => void;
  pendingMedia: PendingMediaAsset[];
}) {
  return (
    <View style={styles.mediaBox}>
      <View style={styles.mediaHeader}>
        <Text style={styles.mediaTitle}>사진·영상</Text>
        <Text style={styles.mediaCountText}>
          {existingMedia.length + pendingMedia.length}/{maxReportMediaFiles}
        </Text>
      </View>

      <View style={styles.mediaActionRow}>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={disabled}
          onPress={() => void onPickMedia("camera")}
          style={[styles.mediaAddButton, disabled && styles.buttonDisabled]}
        >
          <Text style={styles.mediaAddButtonText}>사진 촬영</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={disabled}
          onPress={() => void onPickMedia("library")}
          style={[styles.mediaAddButton, styles.mediaLibraryButton, disabled && styles.buttonDisabled]}
        >
          <Text style={[styles.mediaAddButtonText, styles.mediaLibraryButtonText]}>
            사진·영상
          </Text>
        </TouchableOpacity>
      </View>

      {existingMedia.length || pendingMedia.length ? (
        <View style={styles.mediaList}>
          {existingMedia.map((item) => (
            <View key={item.id} style={styles.mediaItem}>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={!item.signedUrl}
                onPress={() => item.signedUrl && void Linking.openURL(item.signedUrl)}
                style={styles.mediaOpenArea}
              >
                {item.kind === "image" && item.signedUrl ? (
                  <Image source={{ uri: item.signedUrl }} style={styles.mediaThumb} />
                ) : (
                  <View style={[styles.mediaThumb, styles.videoThumb]}>
                    <Text style={styles.videoThumbText}>영상</Text>
                  </View>
                )}
                <View style={styles.mediaItemText}>
                  <Text numberOfLines={1} style={styles.mediaFileName}>
                    {item.fileName}
                  </Text>
                  <Text style={styles.mediaFileMeta}>저장됨 · 눌러서 보기</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => onRemoveExistingMedia(item)}
                style={styles.mediaRemoveButton}
              >
                <Text style={styles.mediaRemoveButtonText}>삭제</Text>
              </TouchableOpacity>
            </View>
          ))}
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
          사진을 찍거나 앨범에서 사진·영상을 추가하세요.
        </Text>
      )}
      <Message text={mediaMessage} />
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
  onShareVetDraft,
}: {
  aiAccess: AiAccessStatus | null;
  episodeId: string | null;
  result: AnalysisResult;
  vetDraft?: VetReviewDraft;
  vetDraftLoading: boolean;
  vetDraftNotice: EpisodeNotice | null;
  onCreateVetDraft: (episodeId: string, reportIds?: string[]) => Promise<boolean>;
  onShareVetDraft: (episodeId: string, draft: VetReviewDraft) => Promise<void>;
}) {
  const checkScore = displayCheckScore(result.riskScore);
  return (
    <View style={[styles.resultCard, styles[`resultCard_${result.riskLevel}`]]}>
      <View style={styles.vetBriefBox}>
        <Text style={styles.vetBriefTitle}>기본 사실 요약</Text>
        <Text style={styles.vetBriefText}>{result.vetBrief}</Text>
      </View>
      <ResultVetDraftBox
        aiAccess={aiAccess}
        episodeId={episodeId}
        vetDraft={vetDraft}
        vetDraftLoading={vetDraftLoading}
        vetDraftNotice={vetDraftNotice}
        onCreateVetDraft={onCreateVetDraft}
        onShareVetDraft={onShareVetDraft}
      />
      <View style={styles.resultHeader}>
        <View>
          <Text style={styles.resultEyebrow}>앱 안전 안내</Text>
          <Text style={styles.resultScore}>{checkScore}</Text>
        </View>
        <Text style={styles.resultRisk}>{riskLabels[result.riskLevel]}</Text>
      </View>
      <Text style={styles.resultTitle}>{result.headline}</Text>
      <Text style={styles.resultSummary}>{result.summary}</Text>
      <Text style={styles.resultMeta}>{recordDateLabel(result.createdAt)}</Text>

      <ResultList title="지금 할 수 있는 일" items={result.actions} />
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
  onShareVetDraft,
}: {
  aiAccess: AiAccessStatus | null;
  episodeId: string | null;
  vetDraft?: VetReviewDraft;
  vetDraftLoading: boolean;
  vetDraftNotice: EpisodeNotice | null;
  onCreateVetDraft: (episodeId: string, reportIds?: string[]) => Promise<boolean>;
  onShareVetDraft: (episodeId: string, draft: VetReviewDraft) => Promise<void>;
}) {
  const canUseAiDraft = Boolean(aiAccess?.enabled);
  const canStartAiDraft =
    canUseAiDraft || aiAccess?.reason === "no_credits";
  return (
    <View style={styles.resultVetDraftBox}>
      <View style={styles.planHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.vetDraftEyebrow}>AI 정리 · 수의사 확인 전</Text>
          <Text style={styles.planTitle}>병원 전달본</Text>
          <Text style={styles.planSubtitle}>
            고른 기록을 수의사가 빠르게 읽을 수 있는 사실 중심 문장으로 정리해요.
          </Text>
        </View>
        <Text
          style={[
            styles.vetDraftBadge,
            canUseAiDraft && styles.vetDraftBadgeEnabled,
          ]}
        >
          {canUseAiDraft
            ? aiDraftCreditLabel(aiAccess)
            : aiAccess?.reason === "no_credits"
              ? "1회 추가"
              : "확인 필요"}
        </Text>
      </View>

      {!episodeId ? (
        <Text style={styles.planEmptyText}>
          저장된 건강 기록에서 만들 수 있어요.
        </Text>
      ) : !canStartAiDraft ? (
        <Text style={styles.planEmptyText}>{aiAccessCopy(aiAccess)}</Text>
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
                {aiDraftActionLabel(
                  vetDraftLoading,
                  Boolean(vetDraft),
                  aiAccess,
                )}
              </Text>
            </TouchableOpacity>
            {vetDraft ? (
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={vetDraftLoading}
                onPress={() => void onShareVetDraft(episodeId, vetDraft)}
                style={styles.vetDraftSecondaryButton}
              >
                <Text style={styles.vetDraftSecondaryButtonText}>전달본 공유</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {vetDraft ? <VetDraftPreview draft={vetDraft} /> : null}
        </>
      )}

      {vetDraftNotice ? (
        <Message text={vetDraftNotice.text} tone={vetDraftNotice.tone} />
      ) : null}
      <Text style={styles.planLimitText}>
        AI로 정리한 전달본은 진단·처방·약물명·용량·치료 계획을 만들지 않으며 수의사 확인 전 자료로 표시됩니다.
      </Text>
    </View>
  );
}

function VetDraftPreview({
  draft,
  onOpenRecord,
  records = [],
}: {
  draft: VetReviewDraft;
  onOpenRecord?: (record: HistoryRecord) => void;
  records?: HistoryRecord[];
}) {
  const sourceRecords = [...records].sort(
    (a, b) =>
      new Date(a.result.createdAt).getTime() -
      new Date(b.result.createdAt).getTime(),
  );

  return (
    <View style={styles.vetDraftPreview}>
      <Text style={styles.vetDraftSource}>
        {draft.source === "openai" ? "AI 정리 · 수의사 확인 전" : "규칙 기반 정리"}
      </Text>
      <Text style={styles.vetDraftOverview}>{draft.overview}</Text>
      <Text style={styles.vetDraftHandoffLabel}>병원에 먼저 전할 내용</Text>
      <Text style={styles.vetDraftHandoff}>{draft.handoffNote}</Text>
      <View style={styles.vetDraftFactList}>
        {draft.keyObservations.slice(0, 3).map((item) => (
          <Text key={item} style={styles.vetDraftFact}>
            · {item}
          </Text>
        ))}
      </View>
      {sourceRecords.length ? (
        <View style={styles.vetDraftSources}>
          <Text style={styles.vetDraftHandoffLabel}>사용한 원본 기록</Text>
          <ScrollView
            horizontal
            contentContainerStyle={styles.vetDraftSourceList}
            showsHorizontalScrollIndicator={false}
          >
            {sourceRecords.map((record) => (
              <TouchableOpacity
                accessibilityLabel={`${formatCalendarDate(toRecordDateKey(record.result.createdAt))} 원본 기록 열기`}
                accessibilityRole="button"
                activeOpacity={0.82}
                key={record.result.id}
                onPress={() => onOpenRecord?.(record)}
                style={styles.vetDraftSourceButton}
              >
                <Text style={styles.vetDraftSourceButtonDate}>
                  {formatCalendarDate(toRecordDateKey(record.result.createdAt))}
                </Text>
                <Text style={styles.vetDraftSourceButtonAction}>원본 보기 ›</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function FactualReportPreview({
  report,
  records,
  planCount,
  onOpenRecord,
  onShare,
}: {
  report: EpisodeReport;
  records: HistoryRecord[];
  planCount: number;
  onOpenRecord: (record: HistoryRecord) => void;
  onShare: () => void;
}) {
  const sourceRecords = [...records].sort(
    (a, b) =>
      new Date(a.result.createdAt).getTime() -
      new Date(b.result.createdAt).getTime(),
  );
  const facts = [
    `기록 기간 · ${report.periodLabel}`,
    report.repeatedSymptoms.length
      ? `반복 관찰 · ${report.repeatedSymptoms.join(", ")}`
      : "반복 관찰 · 없음",
    `식욕 변화 ${report.appetiteChangeCount}회 · 활력 변화 ${report.energyChangeCount}회`,
  ];

  return (
    <View style={styles.factualPreviewBox}>
      <View style={styles.factualPreviewHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.factualPreviewEyebrow}>기본 제공</Text>
          <Text style={styles.factualPreviewTitle}>사실 요약</Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="사실 요약 공유"
          accessibilityRole="button"
          activeOpacity={0.85}
          onPress={onShare}
          style={styles.factualPreviewShareButton}
        >
          <Text style={styles.factualPreviewShareText}>공유</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.factualPreviewFacts}>
        {facts.map((fact) => (
          <Text key={fact} style={styles.factualPreviewFact}>
            {fact}
          </Text>
        ))}
      </View>
      <Text style={styles.factualPreviewMeta}>
        기록 {report.recordCount}회 · 병원 안내 {planCount}개 · 첨부 {report.mediaCount}개
      </Text>
      <ScrollView
        horizontal
        contentContainerStyle={styles.vetDraftSourceList}
        showsHorizontalScrollIndicator={false}
      >
        {sourceRecords.map((record) => (
          <TouchableOpacity
            accessibilityLabel={`${formatCalendarDate(toRecordDateKey(record.result.createdAt))} 원본 기록 열기`}
            accessibilityRole="button"
            activeOpacity={0.82}
            key={record.result.id}
            onPress={() => onOpenRecord(record)}
            style={styles.factualPreviewSourceButton}
          >
            <Text style={styles.vetDraftSourceButtonDate}>
              {formatCalendarDate(toRecordDateKey(record.result.createdAt))}
            </Text>
            <Text style={styles.factualPreviewSourceAction}>원본 보기 ›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const calendarWeekdays = ["일", "월", "화", "수", "목", "금", "토"];
const calendarRiskWeight: Record<RiskLevel, number> = {
  watch: 1,
  soon: 2,
  urgent: 3,
};

function calendarDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00+09:00`);
}

function formatCalendarMonth(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year}년 ${month}월`;
}

function formatCalendarDate(dateKey: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(calendarDate(dateKey));
}

function formatCalendarRange(start: string, end: string | null) {
  if (!end || start === end) return formatCalendarDate(start);
  const startLabel = new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
  }).format(calendarDate(start));
  return `${startLabel}–${formatCalendarDate(end)}`;
}

function highestCalendarRisk(records: HistoryRecord[]) {
  return records.reduce<RiskLevel | null>((highest, record) => {
    if (!highest) return record.result.riskLevel;
    return calendarRiskWeight[record.result.riskLevel] > calendarRiskWeight[highest]
      ? record.result.riskLevel
      : highest;
  }, null);
}

function HealthHistoryCard({
  aiAccess,
  aiFeedbackNotice,
  aiFeedbackSavingUsageId,
  editingPlanEpisodeId,
  episodeGroups,
  history,
  loading,
  message,
  petName,
  planDraft,
  planNotice,
  planSavingEpisodeId,
  vetDraftLoadingEpisodeId,
  vetDraftNotice,
  vetDrafts,
  savedAiFeedbackUsageIds,
  onCancelPlanEdit,
  onChangePlanDraft,
  onCreateVetDraft,
  onGoRecord,
  onRefresh,
  onSavePlan,
  onSaveAiFeedback,
  onEditRecord,
  onDeleteRecord,
  onShareReport,
  onShareVetDraft,
  onStartPlanEdit,
  shareMessage,
}: {
  aiAccess: AiAccessStatus | null;
  aiFeedbackNotice: EpisodeNotice;
  aiFeedbackSavingUsageId: string | null;
  editingPlanEpisodeId: string | null;
  episodeGroups: EpisodeReportGroup[];
  history: HistoryRecord[];
  loading: boolean;
  message: string;
  petName: string;
  planDraft: string;
  planNotice: EpisodeNotice;
  planSavingEpisodeId: string | null;
  vetDraftLoadingEpisodeId: string | null;
  vetDraftNotice: EpisodeNotice;
  vetDrafts: VetDraftMap;
  savedAiFeedbackUsageIds: string[];
  onCancelPlanEdit: () => void;
  onChangePlanDraft: (value: string) => void;
  onCreateVetDraft: (episodeId: string, reportIds?: string[]) => Promise<boolean>;
  onGoRecord: (dateKey?: string) => void;
  onRefresh: () => Promise<void>;
  onSavePlan: (episodeId: string) => Promise<void>;
  onSaveAiFeedback: (
    episodeId: string,
    draft: VetReviewDraft,
    usefulnessScore: AiReportFeedbackInput["usefulnessScore"],
  ) => Promise<void>;
  onEditRecord: (record: HistoryRecord) => void;
  onDeleteRecord: (record: HistoryRecord) => void;
  onShareReport: (report: EpisodeReport) => Promise<void>;
  onShareVetDraft: (episodeId: string, draft: VetReviewDraft) => Promise<void>;
  onStartPlanEdit: (group: EpisodeReportGroup) => void;
  shareMessage: string;
}) {
  const latestDateKey = toRecordDateKey(history[0]?.result.createdAt ?? new Date());
  const [calendarMonth, setCalendarMonth] = useState(() =>
    monthKeyFromDate(history[0]?.result.createdAt ?? new Date()),
  );
  const [selectionStart, setSelectionStart] = useState(latestDateKey);
  const [selectionEnd, setSelectionEnd] = useState<string | null>(latestDateKey);
  const [rangeMode, setRangeMode] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [draftScope, setDraftScope] = useState<string | null>(null);
  const todayKey = toRecordDateKey(new Date());
  const calendarDays = useMemo(
    () => buildRecordCalendar(calendarMonth),
    [calendarMonth],
  );
  const recordsByDate = useMemo(() => {
    const grouped = new Map<string, HistoryRecord[]>();
    for (const record of history) {
      const key = toRecordDateKey(record.result.createdAt);
      if (!key) continue;
      grouped.set(key, [...(grouped.get(key) ?? []), record]);
    }
    return grouped;
  }, [history]);
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
  const relatedEpisodeGroup = useMemo(() => {
    const episodeId = selectedRecords[0]?.episodeId;
    if (!episodeId || selectedRecords.some((record) => record.episodeId !== episodeId)) {
      return undefined;
    }
    return episodeGroups.find((group) => group.episode?.id === episodeId);
  }, [episodeGroups, selectedRecords]);
  const fullEpisodeSelection = Boolean(
    relatedEpisodeGroup &&
      relatedEpisodeGroup.records.length === selectedRecords.length &&
      relatedEpisodeGroup.records.every((record) =>
        selectedRecords.some((selected) => selected.result.id === record.result.id),
      ),
  );
  const selectedGroup = useMemo<EpisodeReportGroup | null>(() => {
    if (!selectedRecords.length) return null;
    const plan = fullEpisodeSelection ? relatedEpisodeGroup?.plan : undefined;
    const selectedProgress = fullEpisodeSelection
      ? relatedEpisodeGroup?.progress ?? []
      : [];
    return {
      key: `calendar:${selectionStart}:${selectionEnd ?? selectionStart}`,
      episode: relatedEpisodeGroup?.episode,
      records: selectedRecords,
      plan,
      progress: selectedProgress,
      report: buildEpisodeReport(
        selectedRecords,
        petName,
        plan,
        selectedProgress,
        relatedEpisodeGroup?.episode?.startedAt,
      ),
      latestAt: selectedRecords[0]?.result.createdAt ?? "",
    };
  }, [
    fullEpisodeSelection,
    petName,
    relatedEpisodeGroup,
    selectedRecords,
    selectionEnd,
    selectionStart,
  ]);
  const selectedRisk = highestCalendarRisk(selectedRecords);
  const cachedVetDraft = selectedGroup?.episode
    ? vetDrafts[selectedGroup.episode.id]
    : undefined;
  const selectedVetDraft =
    selectedGroup && (fullEpisodeSelection || draftScope === selectedGroup.key)
      ? cachedVetDraft
      : undefined;
  function selectCalendarDay(dateKey: string) {
    setCalendarMonth(dateKey.slice(0, 7));
    setReportOpen(false);
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
    setReportOpen(false);
    setRangeMode((current) => {
      if (current) {
        setSelectionEnd(selectionStart);
        return false;
      }
      setSelectionEnd(null);
      return true;
    });
  }

  async function createSelectedVetDraft(episodeId: string, reportIds?: string[]) {
    const scope = selectedGroup?.key ?? null;
    const created = await onCreateVetDraft(episodeId, reportIds);
    if (created) setDraftScope(scope);
    return created;
  }

  if (reportOpen && selectedGroup) {
    return (
      <View style={styles.card}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setReportOpen(false)}
          style={styles.calendarReportBack}
        >
          <Text style={styles.calendarReportBackText}>‹ 달력으로</Text>
        </TouchableOpacity>
        <EpisodeReportItem
          aiAccess={aiAccess}
          aiFeedbackNotice={aiFeedbackNotice}
          aiFeedbackSavingUsageId={aiFeedbackSavingUsageId}
          editingPlanEpisodeId={editingPlanEpisodeId}
          group={selectedGroup}
          planDraft={planDraft}
          planNotice={planNotice}
          planSavingEpisodeId={planSavingEpisodeId}
          vetDraft={selectedVetDraft}
          vetDraftLoadingEpisodeId={vetDraftLoadingEpisodeId}
          vetDraftNotice={vetDraftNotice}
          savedAiFeedbackUsageIds={savedAiFeedbackUsageIds}
          onCancelPlanEdit={onCancelPlanEdit}
          onChangePlanDraft={onChangePlanDraft}
          onCreateVetDraft={createSelectedVetDraft}
          onEditRecord={onEditRecord}
          onSaveAiFeedback={onSaveAiFeedback}
          onSavePlan={onSavePlan}
          onShareReport={onShareReport}
          onShareVetDraft={onShareVetDraft}
          onStartPlanEdit={onStartPlanEdit}
        />
        <Message text={shareMessage} tone="success" />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>병원에 가져갈 기록</Text>
          <Text style={styles.calendarFlowSummary}>
            {history.length
              ? "병원에 보여줄 날짜나 기간을 골라주세요."
              : "먼저 병원에서 설명할 상황을 남겨주세요."}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={loading}
          onPress={() => void onRefresh()}
          style={[styles.smallButton, loading && styles.buttonDisabled]}
        >
          <Text style={styles.smallButtonText}>{loading ? "확인 중" : "새로고침"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.recordCalendarBox}>
        <View style={styles.recordCalendarHeader}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setCalendarMonth((current) => shiftRecordMonth(current, -1))}
            style={styles.recordCalendarMonthButton}
          >
            <Text style={styles.recordCalendarMonthButtonText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.recordCalendarMonth}>{formatCalendarMonth(calendarMonth)}</Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setCalendarMonth((current) => shiftRecordMonth(current, 1))}
            style={styles.recordCalendarMonthButton}
          >
            <Text style={styles.recordCalendarMonthButtonText}>›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.recordCalendarWeekRow}>
          {calendarWeekdays.map((day) => (
            <Text key={day} style={styles.recordCalendarWeekday}>{day}</Text>
          ))}
        </View>
        <View style={styles.recordCalendarGrid}>
          {calendarDays.map((day) => {
            const dayRecords = recordsByDate.get(day.dateKey) ?? [];
            const dayRisk = highestCalendarRisk(dayRecords);
            const selected = isRecordDateInRange(
              day.dateKey,
              selectionStart,
              selectionEnd,
            );
            const edge = day.dateKey === selectionStart || day.dateKey === selectionEnd;
            return (
              <View key={day.dateKey} style={styles.recordCalendarDaySlot}>
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => selectCalendarDay(day.dateKey)}
                  style={[
                    styles.recordCalendarDay,
                    selected && styles.recordCalendarDaySelected,
                    edge && styles.recordCalendarDayEdge,
                  ]}
                >
                  <Text
                    style={[
                      styles.recordCalendarDayText,
                      !day.inCurrentMonth && styles.recordCalendarDayTextOutside,
                      selected && styles.recordCalendarDayTextSelected,
                      day.dateKey === todayKey && styles.recordCalendarDayTextToday,
                    ]}
                  >
                    {day.day}
                  </Text>
                  {dayRecords.length ? (
                    <View
                      style={[
                        styles.recordCalendarMark,
                        dayRisk === "soon" && styles.recordCalendarMarkSoon,
                        dayRisk === "urgent" && styles.recordCalendarMarkUrgent,
                      ]}
                    >
                      {dayRecords.length > 1 ? (
                        <Text style={styles.recordCalendarMarkText}>{dayRecords.length}</Text>
                      ) : null}
                    </View>
                  ) : null}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.calendarSelectionHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.calendarSelectionMode}>
            {rangeMode ? "기간 선택" : "선택한 날짜"}
          </Text>
          <Text style={styles.calendarSelectionTitle}>
            {formatCalendarRange(selectionStart, selectionEnd)}
          </Text>
          <Text style={styles.calendarSelectionMeta}>
            {rangeMode && !selectionEnd
              ? "종료일을 눌러 주세요."
              : `${selectedRecords.length}개 기록${selectedRisk ? ` · ${riskLabels[selectedRisk]}` : ""}`}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={toggleRangeMode}
          style={styles.calendarRangeButton}
        >
          <Text style={styles.calendarRangeButtonText}>
            {rangeMode ? "날짜 보기" : "기간 선택"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.calendarActionRow}>
        {!rangeMode ? (
          <TouchableOpacity
            activeOpacity={0.86}
            disabled={selectionStart > todayKey}
            onPress={() => onGoRecord(selectionStart)}
            style={[
              styles.calendarPrimaryAction,
              selectionStart > todayKey && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.calendarPrimaryActionText}>
              + {selectionStart === todayKey ? "지금 상황" : "당시 상황"}
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          activeOpacity={0.86}
          disabled={!selectionReady || !selectedGroup}
          onPress={() => setReportOpen(true)}
          style={[
            styles.calendarSecondaryAction,
            (!selectionReady || !selectedGroup) && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.calendarSecondaryActionText}>
            {selectedGroup?.episode ? "전달본 준비" : "사실 요약 보기"}
          </Text>
        </TouchableOpacity>
      </View>

      {!rangeMode && selectedRecords.length ? (
        <View style={styles.historyList}>
          {selectedRecords.map((record) => (
            <HistoryRecordItem
              key={record.result.id}
              record={record}
              onDelete={onDeleteRecord}
              onEdit={onEditRecord}
            />
          ))}
        </View>
      ) : !rangeMode ? (
        <Text style={styles.calendarEmptyText}>이 날짜에는 기록이 없어요.</Text>
      ) : null}
      <Message text={message} />
      <Message text={shareMessage} tone="success" />
    </View>
  );
}

function EpisodeReportItem({
  aiAccess,
  aiFeedbackNotice,
  aiFeedbackSavingUsageId,
  editingPlanEpisodeId,
  group,
  planDraft,
  planNotice,
  planSavingEpisodeId,
  vetDraft,
  vetDraftLoadingEpisodeId,
  vetDraftNotice,
  savedAiFeedbackUsageIds,
  onCancelPlanEdit,
  onChangePlanDraft,
  onCreateVetDraft,
  onEditRecord,
  onSaveAiFeedback,
  onSavePlan,
  onShareReport,
  onShareVetDraft,
  onStartPlanEdit,
}: {
  aiAccess: AiAccessStatus | null;
  aiFeedbackNotice: EpisodeNotice;
  aiFeedbackSavingUsageId: string | null;
  editingPlanEpisodeId: string | null;
  group: EpisodeReportGroup;
  planDraft: string;
  planNotice: EpisodeNotice;
  planSavingEpisodeId: string | null;
  vetDraft?: VetReviewDraft;
  vetDraftLoadingEpisodeId: string | null;
  vetDraftNotice: EpisodeNotice;
  savedAiFeedbackUsageIds: string[];
  onCancelPlanEdit: () => void;
  onChangePlanDraft: (value: string) => void;
  onCreateVetDraft: (episodeId: string, reportIds?: string[]) => Promise<boolean>;
  onEditRecord: (record: HistoryRecord) => void;
  onSaveAiFeedback: (
    episodeId: string,
    draft: VetReviewDraft,
    usefulnessScore: AiReportFeedbackInput["usefulnessScore"],
  ) => Promise<void>;
  onSavePlan: (episodeId: string) => Promise<void>;
  onShareReport: (report: EpisodeReport) => Promise<void>;
  onShareVetDraft: (episodeId: string, draft: VetReviewDraft) => Promise<void>;
  onStartPlanEdit: (group: EpisodeReportGroup) => void;
}) {
  const episodeId = group.episode?.id;
  const planTasks = group.plan?.tasks ?? [];
  const isEditingPlan = Boolean(episodeId && editingPlanEpisodeId === episodeId);
  const isSavingPlan = Boolean(episodeId && planSavingEpisodeId === episodeId);
  const itemPlanNotice =
    episodeId && planNotice.episodeId === episodeId ? planNotice : null;
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
          <Text style={styles.episodeTitle}>{group.report.title}</Text>
          <Text style={styles.episodeDescription}>
            {group.report.periodLabel} · {group.report.recordCount}회 기록 · 첨부{" "}
            {group.report.mediaCount}개
          </Text>
        </View>
      </View>

      <FactualReportPreview
        onOpenRecord={onEditRecord}
        onShare={() => void onShareReport(group.report)}
        planCount={planTasks.length}
        records={group.records}
        report={group.report}
      />

      <>
      {episodeId ? (
        <View style={styles.vetDraftBox}>
          <View style={styles.planHeader}>
            <View style={styles.cardHeaderText}>
              <Text style={styles.vetDraftEyebrow}>AI 정리 · 수의사 확인 전</Text>
              <Text style={styles.planTitle}>병원 전달본</Text>
              <Text style={styles.planSubtitle}>
                보호자 메모와 사진, 선택한 사실을 수의사가 빠르게 읽도록 정리해요.
              </Text>
            </View>
            <Text
              style={[
                styles.vetDraftBadge,
            canUseAiDraft && styles.vetDraftBadgeEnabled,
              ]}
            >
              {canUseAiDraft
                ? aiDraftCreditLabel(aiAccess)
                : aiAccess?.reason === "no_credits"
                  ? "1회 추가"
                  : "확인 필요"}
            </Text>
          </View>

          <Text style={styles.episodeExpandedMeta}>
            기록 {group.report.recordCount}회 · 병원 안내 {planTasks.length}개 · 첨부{" "}
            {group.report.mediaCount}개
          </Text>

          {!canUseAiDraft && aiAccess?.reason !== "no_credits" ? (
            <Text style={styles.planEmptyText}>{aiAccessCopy(aiAccess)}</Text>
          ) : (
            <>
              <View style={styles.vetDraftActions}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={isCreatingVetDraft}
                  onPress={() =>
                    void onCreateVetDraft(
                      episodeId,
                      group.records.map((record) => record.result.id),
                    )
                  }
                  style={[
                    styles.vetDraftPrimaryButton,
                    isCreatingVetDraft && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.vetDraftPrimaryButtonText}>
                    {aiDraftActionLabel(
                      isCreatingVetDraft,
                      Boolean(vetDraft),
                      aiAccess,
                    )}
                  </Text>
                </TouchableOpacity>
                {vetDraft ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={isCreatingVetDraft}
                    onPress={() => void onShareVetDraft(episodeId, vetDraft)}
                    style={styles.vetDraftSecondaryButton}
                  >
                    <Text style={styles.vetDraftSecondaryButtonText}>전달본 공유</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {vetDraft ? (
                <>
                  <VetDraftPreview
                    draft={vetDraft}
                    onOpenRecord={onEditRecord}
                    records={group.records}
                  />
                  {feedbackUsageId && !isAiFeedbackSaved ? (
                    <View style={styles.aiFeedbackBox}>
                      <Text style={styles.aiFeedbackTitle}>
                        이 전달본이 도움됐나요?
                      </Text>
                      <View style={styles.aiFeedbackScoreRow}>
                        {aiFeedbackScoreOptions.map((option) => (
                          <TouchableOpacity
                            activeOpacity={0.85}
                            disabled={isSavingAiFeedback}
                            key={option.id}
                            onPress={() =>
                              void onSaveAiFeedback(
                                episodeId,
                                vetDraft,
                                option.id,
                              )
                            }
                            style={[
                              styles.aiFeedbackScoreButton,
                              isSavingAiFeedback && styles.buttonDisabled,
                            ]}
                          >
                            <Text style={styles.aiFeedbackScoreText}>
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {itemAiFeedbackNotice ? (
                    <Message
                      text={itemAiFeedbackNotice.text}
                      tone={itemAiFeedbackNotice.tone}
                    />
                  ) : null}
                </>
              ) : null}
            </>
          )}

          {itemVetDraftNotice ? (
            <Message text={itemVetDraftNotice.text} tone={itemVetDraftNotice.tone} />
          ) : null}
          <Text style={styles.planLimitText}>
            AI 정리이며 진단·처방이 아닌 수의사 확인 전 자료예요.
          </Text>
        </View>
      ) : null}

      {episodeId ? (
        <View style={styles.planBox}>
          <View style={styles.planHeader}>
            <View style={styles.cardHeaderText}>
              <Text style={styles.planTitle}>병원에서 들은 내용</Text>
              <Text style={styles.planSubtitle}>
                {planTasks.length
                  ? "다음 전달본에 자동으로 이어져요."
                  : "다음 병원에서 다시 설명하지 않도록 들은 내용만 남겨요."}
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
                {isEditingPlan ? "닫기" : planTasks.length ? "수정" : "한 줄 남기기"}
              </Text>
            </TouchableOpacity>
          </View>

          {planTasks.length ? (
            <View style={styles.planNoteList}>
              {planTasks.map((task) => (
                <Text key={task.id} style={styles.planNoteText}>
                  · {task.text}
                </Text>
              ))}
            </View>
          ) : null}

          {isEditingPlan ? (
            <View style={styles.planEditor}>
              <TextInput
                multiline
                numberOfLines={3}
                onChangeText={onChangePlanDraft}
                placeholder={"예: 3일 뒤 상태 확인\n예: 물 마시는 양 관찰"}
                placeholderTextColor={colors.placeholder}
                style={[styles.input, styles.textarea, styles.planTextarea]}
                textAlignVertical="top"
                value={planDraft}
              />
              <Text style={styles.planLimitText}>
                병원에서 들은 그대로 줄마다 하나씩, 최대 5개까지 저장해요.
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={isSavingPlan}
                onPress={() => void onSavePlan(episodeId)}
                style={[styles.planSaveButton, isSavingPlan && styles.buttonDisabled]}
              >
                <Text style={styles.planSaveButtonText}>
                  {isSavingPlan ? "저장 중" : "들은 내용 저장"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {itemPlanNotice ? (
            <Message text={itemPlanNotice.text} tone={itemPlanNotice.tone} />
          ) : null}
        </View>
      ) : null}

      <Text style={styles.disclaimer}>{group.report.disclaimer}</Text>
      </>
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
      {mediaSummary ? (
        <View style={styles.historyStorageRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setMediaOpen((current) => !current)}
            style={styles.historyMediaButton}
          >
            <Text style={styles.historyMediaButtonText}>
              {mediaOpen ? `${mediaSummary} 접기` : `${mediaSummary} 보기`}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
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
    return "병원 전달본 이용 가능 횟수를 확인하고 있어요.";
  }
  if (access.reason === "unavailable") {
    return "이용 가능 횟수를 확인하지 못했어요. 잠시 후 다시 확인해 주세요.";
  }
  if (access.reason === "no_credits") {
    return "필요할 때 병원 전달본 1회를 추가해 바로 만들 수 있어요.";
  }
  return `병원 전달본 ${access.availableCredits}회를 이용할 수 있어요.`;
}

function billingMessageTone(message: string): "success" | "error" {
  const failed = /못했|오류|실패|다시 확인/.test(message);
  const completed = /완료됐어요|확인했어요|반영됐어요/.test(message);
  return completed && !failed ? "success" : "error";
}

function aiDraftCreditLabel(access: AiAccessStatus | null) {
  if ((access?.complimentaryCredits ?? 0) > 0) return "첫 1회 무료";
  return `${access?.availableCredits ?? 0}회`;
}

function aiDraftActionLabel(
  loading: boolean,
  hasDraft: boolean,
  access: AiAccessStatus | null,
) {
  if (loading) return "초안 만드는 중";
  if (!hasDraft && (access?.complimentaryCredits ?? 0) > 0) {
    return "첫 전달본 무료로 만들기";
  }
  return hasDraft ? "다시 만들기 · 1회" : "병원 전달본 만들기 · 1회";
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

function speciesLabel(species: Species) {
  return speciesOptions.find((option) => option.id === species)?.label ?? "기타";
}

function avatarLabel(value: string, fallback = "펫") {
  return Array.from(value.trim() || fallback).slice(0, 2).join("");
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.label}>{label}</Text>;
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
  onPress: () => void | Promise<void>;
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
  modalKeyboard: {
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
  homePrepTitle: {
    marginTop: 7,
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 29,
  },
  homePrepText: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
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
  homeExistingRecordsLink: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingVertical: 4,
  },
  homeExistingRecordsText: {
    color: colors.green,
    fontSize: 11,
    fontWeight: "900",
  },
  authTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },
  authValuePreview: {
    marginBottom: 18,
    borderRadius: 20,
    backgroundColor: "#f1f9f5",
    padding: 15,
  },
  authValueEyebrow: {
    color: colors.green,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  authValueTitle: {
    marginTop: 5,
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 23,
  },
  valuePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 13,
  },
  valuePreviewBlock: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#d6e8df",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  valuePreviewResult: {
    borderColor: "#b9ddcd",
    backgroundColor: "#e8f7ef",
  },
  valuePreviewLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "900",
  },
  valuePreviewText: {
    marginTop: 3,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  valuePreviewArrow: {
    color: colors.green,
    fontSize: 17,
    fontWeight: "900",
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
  passwordRecoveryLink: {
    alignItems: "center",
    paddingVertical: 8,
  },
  passwordRecoveryLinkText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
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
  aiBillingActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  aiTrialHint: {
    marginTop: 12,
    color: colors.green,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
  },
  aiBillingPrimary: {
    flex: 1,
    alignItems: "center",
    borderRadius: 15,
    backgroundColor: colors.green,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  aiBillingPrimaryText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  aiBillingRestore: {
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 15,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  aiBillingRestoreText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  quickGuideEntry: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    padding: 14,
  },
  quickGuideEntryTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  quickGuideEntryText: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  quickGuideEntryArrow: {
    color: colors.green,
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 28,
  },
  quickGuideBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(13, 47, 42, 0.48)",
    padding: 20,
  },
  quickGuideDialog: {
    width: "100%",
    maxWidth: 430,
    borderWidth: 1,
    borderColor: "#cbe5d9",
    borderRadius: 28,
    backgroundColor: "#ffffff",
    padding: 24,
  },
  passwordRecoveryDialog: {
    width: "100%",
    maxWidth: 430,
    gap: 12,
    borderWidth: 1,
    borderColor: "#cbe5d9",
    borderRadius: 28,
    backgroundColor: "#ffffff",
    padding: 24,
  },
  billingDialog: {
    width: "100%",
    maxWidth: 430,
    borderWidth: 1,
    borderColor: "#cbe5d9",
    borderRadius: 28,
    backgroundColor: "#ffffff",
    padding: 24,
  },
  billingDescription: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  billingFootnote: {
    marginTop: 12,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 17,
    textAlign: "center",
  },
  billingBalance: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 18,
    borderRadius: 17,
    backgroundColor: "#f3faf6",
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  billingBalanceLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  billingBalanceValue: {
    color: colors.green,
    fontSize: 17,
    fontWeight: "900",
  },
  billingSecondaryButton: {
    alignItems: "center",
    marginTop: 9,
    borderWidth: 1,
    borderColor: "#d7e4de",
    borderRadius: 18,
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  billingSecondaryText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  billingLaterButton: {
    alignItems: "center",
    marginTop: 4,
    paddingVertical: 10,
  },
  billingLaterText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  quickGuideEyebrow: {
    color: colors.green,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  quickGuideTitle: {
    marginTop: 7,
    color: colors.ink,
    fontSize: 23,
    fontWeight: "900",
    lineHeight: 30,
  },
  quickGuideDescription: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  quickGuideValueFlow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
  },
  quickGuideResult: {
    marginBottom: 18,
    marginTop: 10,
    color: colors.green,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
  },
  quickGuideClose: {
    alignItems: "center",
    borderRadius: 18,
    backgroundColor: colors.green,
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  quickGuideCloseText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  quickGuideLater: {
    alignItems: "center",
    paddingTop: 14,
  },
  quickGuideLaterText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
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
  petContextCard: {
    padding: 12,
  },
  petContextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  petSwitcher: {
    gap: 7,
    paddingTop: 10,
    paddingRight: 8,
  },
  petSwitcherButton: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    backgroundColor: "#fbfefd",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  petSwitcherButtonSelected: {
    borderColor: colors.green,
    backgroundColor: colors.greenSoft,
  },
  petSwitcherText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  petSwitcherTextSelected: {
    color: colors.green,
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
  petDeleteButton: {
    alignItems: "center",
    marginTop: 12,
    paddingVertical: 10,
  },
  petDeleteButtonText: {
    color: colors.danger,
    fontSize: 13,
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
  petDetailsToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    backgroundColor: "#fbfefd",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  petDetailsToggleText: {
    color: colors.green,
    fontSize: 13,
    fontWeight: "900",
  },
  petDetailsToggleIcon: {
    color: colors.green,
    fontSize: 18,
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
  recordComposer: {
    marginTop: 14,
    gap: 14,
  },
  composerPrompt: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
  },
  composerTextarea: {
    minHeight: 104,
  },
  composerSectionHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  },
  composerSectionTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  composerSectionHint: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
  },
  observationChipSelected: {
    borderColor: colors.green,
    backgroundColor: colors.greenSoft,
  },
  observationChipTextSelected: {
    color: colors.green,
    fontWeight: "900",
  },
  observationChipRow: {
    gap: 8,
    paddingRight: 10,
  },
  symptomDetailsBox: {
    gap: 10,
    borderRadius: 18,
    backgroundColor: "#f7faf8",
    padding: 12,
  },
  symptomDetailRow: {
    gap: 7,
  },
  symptomDetailPrompt: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  composerDetailBlock: {
    gap: 7,
    borderRadius: 16,
    backgroundColor: "#f7faf8",
    padding: 11,
  },
  composerDetailLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  composerSafetyText: {
    color: "#8b6b4d",
    fontSize: 10,
    lineHeight: 16,
  },
  legacySafetyText: {
    color: colors.danger,
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 16,
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
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  mediaTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  mediaCountText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
  },
  mediaActionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  mediaAddButton: {
    borderRadius: 13,
    backgroundColor: colors.green,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  mediaAddButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  mediaLibraryButton: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#ffffff",
  },
  mediaLibraryButtonText: {
    color: colors.green,
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
  mediaOpenArea: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
    marginTop: 18,
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
  calendarFlowSummary: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  recordCalendarBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    backgroundColor: "#fbfefd",
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  recordCalendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 5,
    marginBottom: 10,
  },
  recordCalendarMonthButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },
  recordCalendarMonthButtonText: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 27,
  },
  recordCalendarMonth: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  recordCalendarWeekRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  recordCalendarWeekday: {
    width: "14.2857%",
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  recordCalendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  recordCalendarDaySlot: {
    width: "14.2857%",
    padding: 2,
  },
  recordCalendarDay: {
    position: "relative",
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  recordCalendarDaySelected: {
    borderRadius: 0,
    backgroundColor: "#eef8f3",
  },
  recordCalendarDayEdge: {
    borderWidth: 1,
    borderColor: "#b9dfce",
    borderRadius: 12,
    backgroundColor: colors.greenSoft,
  },
  recordCalendarDayText: {
    minWidth: 25,
    height: 25,
    color: colors.ink,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 25,
    textAlign: "center",
  },
  recordCalendarDayTextOutside: {
    color: "#b5c0bc",
  },
  recordCalendarDayTextSelected: {
    color: colors.green,
  },
  recordCalendarDayTextToday: {
    borderWidth: 1,
    borderColor: "#79bea1",
    borderRadius: 999,
  },
  recordCalendarMark: {
    position: "absolute",
    bottom: 3,
    minWidth: 7,
    height: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    borderRadius: 999,
    backgroundColor: "#54b78c",
  },
  recordCalendarMarkSoon: {
    backgroundColor: "#d19b54",
  },
  recordCalendarMarkUrgent: {
    backgroundColor: "#ce7068",
  },
  recordCalendarMarkText: {
    color: "#ffffff",
    fontSize: 7,
    fontWeight: "900",
    lineHeight: 8,
  },
  calendarSelectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 15,
  },
  calendarSelectionMode: {
    color: colors.green,
    fontSize: 10,
    fontWeight: "900",
  },
  calendarSelectionTitle: {
    marginTop: 5,
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  calendarSelectionMeta: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  calendarRangeButton: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  calendarRangeButtonText: {
    color: colors.green,
    fontSize: 11,
    fontWeight: "900",
  },
  calendarActionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  calendarPrimaryAction: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: colors.green,
  },
  calendarPrimaryActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  calendarSecondaryAction: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 15,
    backgroundColor: "#ffffff",
  },
  calendarSecondaryActionText: {
    color: colors.green,
    fontSize: 13,
    fontWeight: "900",
  },
  calendarEmptyText: {
    marginTop: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    borderRadius: 15,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    padding: 15,
    textAlign: "center",
  },
  calendarReportBack: {
    alignSelf: "flex-start",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  calendarReportBackText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
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
  episodeTitle: {
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
  episodeExpandedMeta: {
    marginTop: 10,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
  },
  factualPreviewBox: {
    marginTop: 13,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: 13,
  },
  factualPreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  factualPreviewEyebrow: {
    color: colors.green,
    fontSize: 10,
    fontWeight: "900",
  },
  factualPreviewTitle: {
    marginTop: 3,
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  factualPreviewShareButton: {
    borderRadius: 999,
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  factualPreviewShareText: {
    color: colors.green,
    fontSize: 11,
    fontWeight: "900",
  },
  factualPreviewFacts: {
    gap: 5,
    marginTop: 11,
  },
  factualPreviewFact: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  factualPreviewMeta: {
    marginTop: 9,
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
  },
  factualPreviewSourceButton: {
    minWidth: 98,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    backgroundColor: "#f8fcfa",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  factualPreviewSourceAction: {
    marginTop: 5,
    color: colors.green,
    fontSize: 10,
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
  planNoteList: {
    gap: 6,
    marginTop: 11,
  },
  planNoteText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
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
    minHeight: 84,
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
  vetDraftFactList: {
    gap: 4,
    marginTop: 9,
  },
  vetDraftFact: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  vetDraftSources: {
    marginTop: 2,
  },
  vetDraftSourceList: {
    gap: 8,
    paddingRight: 8,
    paddingTop: 7,
  },
  vetDraftSourceButton: {
    minWidth: 108,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    backgroundColor: "#f8fcfa",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  vetDraftSourceButtonDate: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
  },
  vetDraftSourceButtonAction: {
    marginTop: 7,
    color: colors.green,
    fontSize: 10,
    fontWeight: "900",
  },
  aiFeedbackBox: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
  },
  aiFeedbackTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  aiFeedbackScoreRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
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
  aiFeedbackScoreText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
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
});
