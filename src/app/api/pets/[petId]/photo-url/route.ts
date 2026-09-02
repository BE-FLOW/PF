import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { isUuid } from "@/lib/report-storage";
import { getPetPhotoSignedUrl } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ petId: string }> },
) {
  const accessToken = accessTokenFromRequest(request);
  const { petId } = await context.params;
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  if (!isUuid(petId)) {
    return NextResponse.json(
      { error: "반려동물 정보를 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const signedUrl = await getPetPhotoSignedUrl(accessToken, petId);
  if (!signedUrl) {
    return NextResponse.json(
      { error: "프로필 사진을 불러오지 못했어요." },
      { status: 404 },
    );
  }
  return NextResponse.json({ signedUrl });
}
