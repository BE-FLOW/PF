import { NextRequest, NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { syncRevenueCatPurchases } from "@/lib/revenuecat";
import {
  getAiAccessStatusForUser,
  getAiReportAccess,
} from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const access = await getAiReportAccess(accessTokenFromRequest(request));
  if (!access) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  try {
    const sync = await syncRevenueCatPurchases(access.userId);
    const status = await getAiAccessStatusForUser(access.userId);
    if (!sync.configured) {
      return NextResponse.json(
        { error: "결제 연결을 준비하고 있어요.", access: status },
        { status: 503 },
      );
    }
    return NextResponse.json({ synced: true, access: status });
  } catch {
    return NextResponse.json(
      { error: "구매 내역을 확인하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }
}
