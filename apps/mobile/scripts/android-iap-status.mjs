import path from "node:path";
import {
  createGooglePlayClient,
  googlePlayDefaults,
  hasStatus,
  parseArgs,
} from "./lib/google-play.mjs";

const args = parseArgs();
const packageName =
  args.get("--package-name") || googlePlayDefaults.packageName;
const productId =
  args.get("--product-id") || "petflow_ai_summary_1";
const credentialsPath = path.resolve(
  args.get("--credentials") || googlePlayDefaults.credentialsPath,
);
const { request } = createGooglePlayClient({ credentialsPath });

try {
  const product = await request(
    `/applications/${encodeURIComponent(packageName)}/oneTimeProducts/${encodeURIComponent(productId)}`,
  );
  const purchaseOptions = product.purchaseOptions ?? [];
  const koreanPrice = purchaseOptions
    .flatMap((option) => option.regionalPricingAndAvailabilityConfigs ?? [])
    .find((config) => config.regionCode === "KR");

  console.log(
    JSON.stringify(
      {
        packageName,
        productId,
        exists: true,
        title:
          product.listings?.find(
            (listing) => listing.languageCode === "ko-KR",
          )?.title ?? null,
        purchaseOptions: purchaseOptions.map((option) => ({
          id: option.purchaseOptionId,
          state: option.state,
          legacyCompatible: option.buyOption?.legacyCompatible ?? false,
        })),
        koreanPrice: koreanPrice?.price ?? null,
        koreanAvailability: koreanPrice?.availability ?? null,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (hasStatus(error, 404)) {
    console.log(
      JSON.stringify(
        { packageName, productId, exists: false, purchaseOptions: [] },
        null,
        2,
      ),
    );
  } else {
    throw error;
  }
}
