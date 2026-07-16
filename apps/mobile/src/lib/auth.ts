import type { User } from "@supabase/supabase-js";

export type OAuthProvider = "google" | "apple";
export type OAuthProviderStatus = Record<OAuthProvider, boolean>;

export const oauthProviderLabels: Record<OAuthProvider, string> = {
  google: "Google",
  apple: "Apple",
};

export const defaultOAuthProviderStatus: OAuthProviderStatus = {
  google: true,
  apple: true,
};

function readProviderFlag(
  settings: Record<string, unknown>,
  provider: OAuthProvider,
  fallback: boolean,
) {
  const external = settings.external;
  if (external && typeof external === "object") {
    const value = (external as Record<string, unknown>)[provider];
    if (typeof value === "boolean") return value;
  }

  const legacyValue = settings[`external_${provider}_enabled`];
  return typeof legacyValue === "boolean" ? legacyValue : fallback;
}

export async function fetchOAuthProviderStatus(
  supabaseUrl: string | undefined,
  publishableKey: string | undefined,
) {
  if (!supabaseUrl || !publishableKey) return defaultOAuthProviderStatus;

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
      },
    });
    if (!response.ok) return defaultOAuthProviderStatus;

    const settings = (await response.json()) as Record<string, unknown>;
    return {
      google: readProviderFlag(settings, "google", defaultOAuthProviderStatus.google),
      apple: readProviderFlag(settings, "apple", defaultOAuthProviderStatus.apple),
    };
  } catch {
    return defaultOAuthProviderStatus;
  }
}

function authErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error
    ? String((error as { code?: string }).code ?? "")
    : "";
}

function authErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "";
}

export function passwordAuthErrorMessage(
  mode: "login" | "signup",
  error: unknown,
) {
  const code = authErrorCode(error);
  const message = authErrorMessage(error).toLowerCase();

  if (
    code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("already exists")
  ) {
    return "이미 가입된 이메일이에요. 로그인으로 들어가거나 Google/Apple로 계속해 주세요.";
  }

  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials")
  ) {
    return "이메일 또는 비밀번호를 확인해 주세요.";
  }

  if (message.includes("weak password") || message.includes("password")) {
    return "비밀번호 조건을 다시 확인해 주세요.";
  }

  if (code === "signup_disabled" || message.includes("signup")) {
    return "지금은 새 계정 가입 설정을 확인해야 해요. 잠시 후 다시 시도해 주세요.";
  }

  return mode === "signup"
    ? "가입을 완료하지 못했어요. 이메일과 비밀번호를 확인해 주세요."
    : "로그인을 완료하지 못했어요. 입력 내용을 확인해 주세요.";
}

export function hasLinkedProvider(user: User | null, provider: OAuthProvider) {
  return Boolean(user?.identities?.some((identity) => identity.provider === provider));
}

export function oauthLinkErrorMessage(provider: OAuthProvider, error: unknown) {
  const label = oauthProviderLabels[provider];
  const code = authErrorCode(error);
  const message = authErrorMessage(error).toLowerCase();

  if (code === "manual_linking_disabled" || message.includes("manual")) {
    return "계정 연결 설정이 아직 꺼져 있어요. 관리자 설정을 확인해 주세요.";
  }
  if (
    code === "identity_already_exists" ||
    message.includes("identity_already_exists") ||
    message.includes("already")
  ) {
    return `${label} 계정이 이미 다른 펫플로우 계정에 연결되어 있어요. 기록이 섞이지 않도록 연결하지 않았어요.`;
  }
  return `${label} 계정을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.`;
}

export function oauthCallbackErrorMessage(error: unknown) {
  const code = authErrorCode(error);
  const message = authErrorMessage(error).toLowerCase();

  if (
    code === "bad_code_verifier" ||
    message.includes("code verifier") ||
    message.includes("auth code") ||
    message.includes("invalid_grant") ||
    message.includes("invalid request")
  ) {
    return "로그인 확인 코드가 만료되었거나 앱으로 제대로 돌아오지 않았어요. Google 또는 Apple로 다시 시작해 주세요.";
  }
  if (message.includes("redirect") || message.includes("provider")) {
    return "로그인 설정을 확인해야 해요. 관리자에게 Redirect URL과 Provider 설정을 알려 주세요.";
  }
  return "로그인을 완료하지 못했어요. 다시 시도해 주세요.";
}

function callbackParam(url: string, key: string) {
  try {
    const parsed = new URL(url);
    const searchValue = parsed.searchParams.get(key);
    if (searchValue) return searchValue;

    const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
    return hash ? new URLSearchParams(hash).get(key) ?? "" : "";
  } catch {
    return "";
  }
}

export function oauthCallbackCode(url: string) {
  return callbackParam(url, "code");
}

export function oauthCallbackUrlErrorMessage(url: string) {
  try {
    const code =
      callbackParam(url, "error_code") ||
      callbackParam(url, "error") ||
      "";
    const description = callbackParam(url, "error_description");
    const message = `${code} ${description}`.toLowerCase();

    if (!code && !description) return "";

    if (message.includes("access_denied") || message.includes("cancel")) {
      return "로그인을 취소했어요. 다시 시도하려면 Google 또는 Apple 버튼을 눌러 주세요.";
    }

    if (message.includes("already") || message.includes("identity")) {
      return "이미 같은 이메일로 만든 계정이 있어요. 기존 이메일 계정으로 로그인한 뒤 Google/Apple 연결을 눌러 주세요.";
    }

    if (message.includes("provider") || message.includes("redirect")) {
      return "로그인 설정을 확인해야 해요. 관리자에게 Provider와 Redirect URL 설정을 알려 주세요.";
    }

    return "로그인을 완료하지 못했어요. 다시 시도해 주세요.";
  } catch {
    return "";
  }
}

export function oauthSignInErrorMessage(provider: OAuthProvider, error: unknown) {
  const label = oauthProviderLabels[provider];
  const message = authErrorMessage(error).toLowerCase();

  if (message.includes("provider") || message.includes("unsupported")) {
    return `${label} 로그인이 아직 활성화되지 않았어요. 관리자 설정을 확인해 주세요.`;
  }
  if (message.includes("redirect")) {
    return `${label} 로그인 Redirect URL 설정을 확인해야 해요.`;
  }
  return `${label} 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.`;
}
