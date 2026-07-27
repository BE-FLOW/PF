import {
  appStoreConnectDefaults,
  createAppStoreConnectClient,
  parseArgs,
} from "./lib/app-store-connect.mjs";

const args = parseArgs();
const appId = args.get("--app-id") || appStoreConnectDefaults.appId;
const productId = args.get("--product-id") || "petflow_ai_summary_1";
const { request } = createAppStoreConnectClient({
  keyId: args.get("--key-id") || appStoreConnectDefaults.keyId,
  issuerId: args.get("--issuer-id") || appStoreConnectDefaults.issuerId,
});

const query = new URLSearchParams({
  "filter[productId]": productId,
  limit: "10",
});
const response = await request(
  `/v1/apps/${appId}/inAppPurchasesV2?${query.toString()}`,
);
const purchases = response?.data ?? [];

if (purchases.length === 0) {
  console.log(
    JSON.stringify(
      { appId, productId, exists: false, state: null, type: null },
      null,
      2,
    ),
  );
} else {
  const purchase = purchases[0];
  console.log(
    JSON.stringify(
      {
        appId,
        productId,
        exists: true,
        id: purchase.id,
        name: purchase.attributes?.name ?? null,
        state: purchase.attributes?.state ?? null,
        type: purchase.attributes?.inAppPurchaseType ?? null,
      },
      null,
      2,
    ),
  );
}
