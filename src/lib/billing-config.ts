function configuredProductIds() {
  return [
    process.env.REVENUECAT_AI_SUMMARY_PRODUCT_ID,
    ...(process.env.REVENUECAT_AI_SUMMARY_PRODUCT_IDS?.split(",") ?? []),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

export function revenueCatProductIds() {
  return new Set(configuredProductIds());
}

export function revenueCatServerConfiguration() {
  const customerSync = Boolean(
    process.env.REVENUECAT_SECRET_API_KEY?.trim(),
  );
  const webhook = Boolean(
    process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN?.trim(),
  );
  const productAllowlist = configuredProductIds().length > 0;

  return {
    customerSync,
    webhook,
    productAllowlist,
    ready: customerSync && webhook && productAllowlist,
  };
}
