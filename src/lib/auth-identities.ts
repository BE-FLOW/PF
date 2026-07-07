import type { User } from "@supabase/supabase-js";

export type OAuthProvider = "google" | "apple";
export type OAuthProviderStatus = Record<OAuthProvider, boolean>;

export const oauthProviderLabels: Record<OAuthProvider, string> = {
  google: "Google",
  apple: "Apple",
};

export const defaultOAuthProviderStatus: OAuthProviderStatus = {
  google: true,
  apple: false,
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
