import type { User } from "@supabase/supabase-js";

export type OAuthProvider = "google" | "apple";

export const oauthProviderLabels: Record<OAuthProvider, string> = {
  google: "Google",
  apple: "Apple",
};

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
