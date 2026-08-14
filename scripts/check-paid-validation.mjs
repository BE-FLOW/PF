#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const envFileArg = process.argv.find((arg) => arg.startsWith("--env-file="));
const daysArg = process.argv.find((arg) => arg.startsWith("--days="));
const envFile = resolve(process.cwd(), envFileArg?.split("=")[1] ?? ".env.local");
const days = Number(daysArg?.split("=")[1] ?? 30);

if (!Number.isInteger(days) || days < 1 || days > 365) {
  throw new Error("--days must be an integer between 1 and 365");
}

function loadEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function number(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + number(row[key]), 0);
}

function formatMoney(amount, currency) {
  if (amount === null || amount === undefined || !currency) return "금액 미수신";
  try {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency,
    }).format(number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}

async function selectPaidUsage(client, purchaseIds) {
  if (!purchaseIds.length) return [];
  const { data: grants, error: grantsError } = await client
    .from("ai_credit_grants")
    .select("id")
    .eq("source", "purchase")
    .in("purchase_id", purchaseIds);
  if (grantsError) throw grantsError;

  const grantIds = (grants ?? []).map((grant) => grant.id);
  if (!grantIds.length) return [];
  const { data: ledger, error: ledgerError } = await client
    .from("ai_credit_ledger")
    .select("usage_id")
    .eq("reason", "usage")
    .in("grant_id", grantIds);
  if (ledgerError) throw ledgerError;

  const usageIds = [...new Set((ledger ?? []).map((row) => row.usage_id).filter(Boolean))];
  if (!usageIds.length) return [];
  const { data: usage, error: usageError } = await client
    .from("ai_report_usage")
    .select("id,status,generated_at,estimated_cost_usd")
    .in("id", usageIds);
  if (usageError) throw usageError;
  return usage ?? [];
}

function validationStatus(purchases, paidSummaries, shares) {
  if (!purchases) return "실결제 전";
  if (!paidSummaries) return "실결제 확인 · 유료 전달본 생성 확인 필요";
  if (!shares) return "실결제와 유료 전달본 생성 확인 · 공유 신호 필요";
  return "실결제 · 유료 전달본 생성 · 공유 신호 확인";
}

async function main() {
  loadEnv(envFile);
  const url = (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  )?.replace(/\/$/, "");
  if (!url) throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const since = new Date(Date.now() - (days - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [metricsResult, purchasesResult, firstPurchaseResult] = await Promise.all([
    client
      .from("billing_daily_metrics")
      .select("*")
      .gte("metric_date", since)
      .order("metric_date", { ascending: false }),
    client
      .from("billing_purchases")
      .select(
        "id,store,product_id,purchased_at,price_amount,currency,price_usd,tax_percentage,commission_percentage",
      )
      .eq("status", "active")
      .eq("environment", "production")
      .gte("purchased_at", `${since}T00:00:00Z`)
      .order("purchased_at", { ascending: true }),
    client
      .from("billing_purchases")
      .select("store,product_id,purchased_at,price_amount,currency")
      .eq("status", "active")
      .eq("environment", "production")
      .order("purchased_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (metricsResult.error) throw metricsResult.error;
  if (purchasesResult.error) throw purchasesResult.error;
  if (firstPurchaseResult.error) throw firstPurchaseResult.error;

  const metrics = metricsResult.data ?? [];
  const purchases = purchasesResult.data ?? [];
  const paidUsage = await selectPaidUsage(
    client,
    purchases.map((purchase) => purchase.id),
  );
  const paidSummaries = paidUsage.filter((usage) => usage.status === "succeeded");
  const totals = {
    paywallViews: sum(metrics, "paywall_views"),
    purchaseStarts: sum(metrics, "purchase_starts"),
    verifiedPurchases: purchases.length,
    repeatPurchases: sum(metrics, "repeat_purchases"),
    paidSummaries: paidSummaries.length,
    allSummaryShares: sum(metrics, "summary_shares"),
    grossRevenueUsd: purchases.reduce(
      (total, purchase) => total + number(purchase.price_usd),
      0,
    ),
    estimatedProceedsUsd: purchases.reduce(
      (total, purchase) =>
        total +
        number(purchase.price_usd) *
          (1 - number(purchase.tax_percentage)) *
          (1 - number(purchase.commission_percentage)),
      0,
    ),
    paidAiCostUsd: paidSummaries.reduce(
      (total, usage) => total + number(usage.estimated_cost_usd),
      0,
    ),
  };
  const firstPurchase = firstPurchaseResult.data;
  const output = {
    period: `${since} ~ 오늘 (${days}일)`,
    status: validationStatus(
      totals.verifiedPurchases,
      totals.paidSummaries,
      totals.allSummaryShares,
    ),
    funnel: {
      ...totals,
      paywallToPurchasePercent: percent(
        totals.verifiedPurchases,
        totals.paywallViews,
      ),
      purchaseToPaidSummaryPercent: percent(
        totals.paidSummaries,
        totals.verifiedPurchases,
      ),
    },
    firstVerifiedPurchase: firstPurchase
      ? {
          purchasedAt: firstPurchase.purchased_at,
          store: firstPurchase.store,
          productId: firstPurchase.product_id,
          price: formatMoney(firstPurchase.price_amount, firstPurchase.currency),
        }
      : null,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
