import { Platform } from "react-native";
import Purchases, {
  type PurchasesStoreProduct,
} from "react-native-purchases";

export interface MobileBillingProduct {
  identifier: string;
  priceLabel: string;
}

export type MobilePurchaseResult =
  | { status: "purchased" }
  | { status: "cancelled" }
  | { status: "unavailable"; message: string }
  | { status: "failed"; message: string };

const productId =
  process.env.EXPO_PUBLIC_REVENUECAT_AI_SUMMARY_PRODUCT_ID?.trim() ||
  "petflow_ai_summary_1";

let activeUserId: string | null = null;
let cachedProduct: PurchasesStoreProduct | null = null;
let identityTransition: Promise<void> = Promise.resolve();

function queueIdentityTransition<T>(task: () => Promise<T>) {
  const result = identityTransition.then(task, task);
  identityTransition = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function platformApiKey() {
  if (Platform.OS === "ios") {
    return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() || null;
  }
  if (Platform.OS === "android") {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() || null;
  }
  return null;
}

export function isMobileBillingAvailable() {
  return Boolean(platformApiKey());
}

export async function configureMobileBilling(userId: string) {
  const apiKey = platformApiKey();
  if (!apiKey || !userId.trim()) return false;

  return queueIdentityTransition(async () => {
    if (!(await Purchases.isConfigured())) {
      Purchases.configure({ apiKey, appUserID: userId });
    } else {
      const currentUserId = await Purchases.getAppUserID();
      if (currentUserId !== userId) {
        await Purchases.logIn(userId);
        cachedProduct = null;
      }
    }

    activeUserId = userId;
    return true;
  });
}

async function loadProduct(userId: string) {
  if (!(await configureMobileBilling(userId))) return null;
  if (cachedProduct) return cachedProduct;

  const products = await Purchases.getProducts(
    [productId],
    Purchases.PRODUCT_CATEGORY.NON_SUBSCRIPTION,
  );
  cachedProduct =
    products.find((product) => product.identifier === productId) ?? null;
  return cachedProduct;
}

export async function getMobileBillingProduct(
  userId: string,
): Promise<MobileBillingProduct | null> {
  try {
    const product = await loadProduct(userId);
    return product
      ? { identifier: product.identifier, priceLabel: product.priceString }
      : null;
  } catch {
    return null;
  }
}

export async function purchaseAiSummaryCredit(
  userId: string,
): Promise<MobilePurchaseResult> {
  try {
    const product = await loadProduct(userId);
    if (!product) {
      return {
        status: "unavailable",
        message: "결제 상품을 불러오지 못했어요.",
      };
    }
    await Purchases.purchaseStoreProduct(product);
    return { status: "purchased" };
  } catch (error) {
    if ((error as { userCancelled?: boolean }).userCancelled) {
      return { status: "cancelled" };
    }
    return {
      status: "failed",
      message: "결제를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
  }
}

export async function refreshAiSummaryPurchaseHistory(userId: string) {
  if (!(await configureMobileBilling(userId))) {
    return {
      refreshed: false,
      message: "결제 연결을 준비하고 있어요.",
    };
  }

  try {
    await Purchases.invalidateCustomerInfoCache();
    await Purchases.getCustomerInfo();
    return { refreshed: true, message: "구매 내역을 확인했어요." };
  } catch {
    return {
      refreshed: false,
      message: "구매 내역을 확인하지 못했어요.",
    };
  }
}

export function subscribeToMobileBillingUpdates(listener: () => void) {
  const customerInfoListener = () => listener();
  Purchases.addCustomerInfoUpdateListener(customerInfoListener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(customerInfoListener);
  };
}

export async function resetMobileBillingCache() {
  activeUserId = null;
  cachedProduct = null;
  await queueIdentityTransition(async () => {
    try {
      if (!(await Purchases.isConfigured())) return;
      const currentUserId = await Purchases.getAppUserID();
      if (!currentUserId.startsWith("$RCAnonymousID:")) {
        await Purchases.logOut();
      }
    } catch {
      // App sign-out must still complete if the store SDK is unavailable.
    }
  });
}

export function mobileBillingUserId() {
  return activeUserId;
}
