import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  platform: { OS: "ios" },
  addCustomerInfoUpdateListener: vi.fn(),
  configure: vi.fn(),
  getAppUserID: vi.fn(),
  getCustomerInfo: vi.fn(),
  getProducts: vi.fn(),
  invalidateCustomerInfoCache: vi.fn(),
  isConfigured: vi.fn(),
  logIn: vi.fn(),
  logOut: vi.fn(),
  purchaseStoreProduct: vi.fn(),
  removeCustomerInfoUpdateListener: vi.fn(),
}));

vi.mock("react-native", () => ({ Platform: mocks.platform }));
vi.mock("react-native-purchases", () => ({
  default: {
    PRODUCT_CATEGORY: { NON_SUBSCRIPTION: "NON_SUBSCRIPTION" },
    addCustomerInfoUpdateListener: mocks.addCustomerInfoUpdateListener,
    configure: mocks.configure,
    getAppUserID: mocks.getAppUserID,
    getCustomerInfo: mocks.getCustomerInfo,
    getProducts: mocks.getProducts,
    invalidateCustomerInfoCache: mocks.invalidateCustomerInfoCache,
    isConfigured: mocks.isConfigured,
    logIn: mocks.logIn,
    logOut: mocks.logOut,
    purchaseStoreProduct: mocks.purchaseStoreProduct,
    removeCustomerInfoUpdateListener: mocks.removeCustomerInfoUpdateListener,
  },
}));

async function loadBilling() {
  vi.resetModules();
  return import("./billing");
}

beforeEach(() => {
  Object.values(mocks).forEach((value) => {
    if (typeof value === "function" && "mockReset" in value) value.mockReset();
  });
  mocks.platform.OS = "ios";
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = "appl_test_key";
  delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  mocks.isConfigured.mockResolvedValue(false);
});

describe("iOS billing", () => {
  it("configures RevenueCat with the signed-in account", async () => {
    const billing = await loadBilling();

    await expect(billing.configureMobileBilling("user-1")).resolves.toBe(true);
    expect(mocks.configure).toHaveBeenCalledWith({
      apiKey: "appl_test_key",
      appUserID: "user-1",
    });
    expect(billing.mobileBillingUserId()).toBe("user-1");
  });

  it("switches an already configured SDK to the current account", async () => {
    mocks.isConfigured.mockResolvedValue(true);
    mocks.getAppUserID.mockResolvedValue("user-1");
    const billing = await loadBilling();

    await billing.configureMobileBilling("user-2");

    expect(mocks.logIn).toHaveBeenCalledWith("user-2");
    expect(billing.mobileBillingUserId()).toBe("user-2");
  });

  it("returns a cancelled result without presenting it as a failure", async () => {
    const product = {
      identifier: "petflow_ai_summary_1",
      priceString: "₩1,100",
    };
    mocks.getProducts.mockResolvedValue([product]);
    mocks.purchaseStoreProduct.mockRejectedValue({ userCancelled: true });
    const billing = await loadBilling();

    await expect(billing.purchaseAiSummaryCredit("user-1")).resolves.toEqual({
      status: "cancelled",
    });
  });

  it("disconnects a named store account during app sign-out", async () => {
    mocks.isConfigured.mockResolvedValue(true);
    mocks.getAppUserID.mockResolvedValue("user-1");
    const billing = await loadBilling();

    await billing.resetMobileBillingCache();

    expect(mocks.logOut).toHaveBeenCalledOnce();
    expect(billing.mobileBillingUserId()).toBeNull();
  });
});
