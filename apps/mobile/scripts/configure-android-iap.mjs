import path from "node:path";
import {
  createGooglePlayClient,
  googlePlayDefaults,
  hasStatus,
  parseArgs,
} from "./lib/google-play.mjs";

const defaults = Object.freeze({
  productId: "petflow_ai_summary_1",
  purchaseOptionId: "standard",
  locale: "ko-KR",
  title: "AI 병원 전달 요약 1회",
  description: "보호자 기록을 사실 중심의 병원 전달용 AI 초안으로 한 번 정리합니다.",
  currencyCode: "KRW",
  priceUnits: "1900",
});

const args = parseArgs();
const apply = args.get("--apply") === "true";
const replaceExisting = args.get("--replace-existing") === "true";
const packageName =
  args.get("--package-name") || googlePlayDefaults.packageName;
const productId = args.get("--product-id") || defaults.productId;
const credentialsPath = path.resolve(
  args.get("--credentials") || googlePlayDefaults.credentialsPath,
);
const { request } = createGooglePlayClient({ credentialsPath });

async function getProduct() {
  try {
    return await request(
      `/applications/${encodeURIComponent(packageName)}/oneTimeProducts/${encodeURIComponent(productId)}`,
    );
  } catch (error) {
    if (hasStatus(error, 404)) return null;
    throw error;
  }
}

async function convertedPrices() {
  return request(
    `/applications/${encodeURIComponent(packageName)}/pricing:convertRegionPrices`,
    {
      method: "POST",
      body: JSON.stringify({
        price: {
          currencyCode: defaults.currencyCode,
          units: defaults.priceUnits,
        },
      }),
    },
  );
}

function buildProduct(pricing) {
  const regionalPricingAndAvailabilityConfigs = Object.values(
    pricing.convertedRegionPrices ?? {},
  ).map((regionalPrice) => ({
    regionCode: regionalPrice.regionCode,
    price: regionalPrice.price,
    availability: "AVAILABLE",
  }));

  if (regionalPricingAndAvailabilityConfigs.length === 0) {
    throw new Error("Google Play regional prices could not be calculated.");
  }

  return {
    packageName,
    productId,
    listings: [
      {
        languageCode: defaults.locale,
        title: defaults.title,
        description: defaults.description,
      },
    ],
    purchaseOptions: [
      {
        purchaseOptionId: defaults.purchaseOptionId,
        regionalPricingAndAvailabilityConfigs,
        newRegionsConfig: {
          usdPrice: pricing.convertedOtherRegionsPrice?.usdPrice,
          eurPrice: pricing.convertedOtherRegionsPrice?.eurPrice,
          availability: "AVAILABLE",
        },
        buyOption: {
          legacyCompatible: true,
          multiQuantityEnabled: false,
        },
      },
    ],
  };
}

async function upsertProduct(product, regionVersion) {
  const query = new URLSearchParams({
    updateMask: "listings,purchaseOptions",
    "regionsVersion.version": regionVersion.version,
    allowMissing: "true",
  });
  // Google defines PATCH with lowercase onetimeproducts; read/state routes use oneTimeProducts.
  return request(
    `/applications/${encodeURIComponent(packageName)}/onetimeproducts/${encodeURIComponent(productId)}?${query.toString()}`,
    {
      method: "PATCH",
      body: JSON.stringify(product),
    },
  );
}

async function activatePurchaseOption() {
  return request(
    `/applications/${encodeURIComponent(packageName)}/oneTimeProducts/${encodeURIComponent(productId)}/purchaseOptions:batchUpdateStates`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            activatePurchaseOptionRequest: {
              packageName,
              productId,
              purchaseOptionId: defaults.purchaseOptionId,
            },
          },
        ],
      }),
    },
  );
}

function actionableSetupError(error) {
  if (
    hasStatus(error, 400) &&
    /precondition check failed/i.test(error.message)
  ) {
    return new Error(
      "Google Play 결제 프로필이 앱에 연결되지 않았습니다. Play Console의 수익 창출 설정에서 결제 프로필을 연결한 뒤 다시 실행해 주세요.",
      { cause: error },
    );
  }
  return error;
}

let product = await getProduct();
const actions = [];

if (!product) {
  actions.push("create_one_time_product");
} else if (replaceExisting) {
  actions.push("replace_product_configuration");
}

if (
  product &&
  !product.purchaseOptions?.some(
    (option) => option.purchaseOptionId === defaults.purchaseOptionId,
  )
) {
  actions.push("replace_existing_product_required");
}

if (
  apply &&
  product &&
  !replaceExisting &&
  actions.includes("replace_existing_product_required")
) {
  throw new Error(
    `Existing product ${productId} does not contain purchase option ${defaults.purchaseOptionId}. Review it, then re-run with --apply --replace-existing.`,
  );
}

if (
  product?.purchaseOptions?.some(
    (option) =>
      option.purchaseOptionId === defaults.purchaseOptionId &&
      option.state !== "ACTIVE",
  )
) {
  actions.push("activate_purchase_option");
}

try {
  if (apply && (!product || replaceExisting)) {
    const pricing = await convertedPrices();
    product = await upsertProduct(
      buildProduct(pricing),
      pricing.regionVersion,
    );
  }

  const option = product?.purchaseOptions?.find(
    (item) => item.purchaseOptionId === defaults.purchaseOptionId,
  );
  if (apply && option && option.state !== "ACTIVE") {
    await activatePurchaseOption();
    product = await getProduct();
  }
} catch (error) {
  throw actionableSetupError(error);
}

console.log(
  JSON.stringify(
    {
      apply,
      packageName,
      productId,
      purchaseOptionId: defaults.purchaseOptionId,
      targetPrice: `${defaults.priceUnits} ${defaults.currencyCode}`,
      exists: Boolean(product),
      state:
        product?.purchaseOptions?.find(
          (item) => item.purchaseOptionId === defaults.purchaseOptionId,
        )?.state ?? null,
      actions,
      message: apply
        ? "Google Play one-time product configuration was applied."
        : "Dry run only. Re-run with --apply to create or activate the product.",
      existingProductGuard:
        product && !replaceExisting
          ? "Existing product metadata and prices were preserved. Use --replace-existing only after reviewing the current product."
          : null,
    },
    null,
    2,
  ),
);
