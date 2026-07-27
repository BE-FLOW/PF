import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-request";
import { isUuid } from "@/lib/report-storage";
import {
  preparePetPhotoUpload,
  type PetPhotoUploadInput,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(
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
  const parsed = await readJsonBody<Partial<PetPhotoUploadInput>>(
    request,
    4 * 1024,
  );
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status },
    );
  }
  const input = parsed.value;
  if (
    typeof input.fileName !== "string" ||
    typeof input.mimeType !== "string" ||
    typeof input.sizeBytes !== "number"
  ) {
    return NextResponse.json(
      { error: "프로필 사진 정보를 다시 확인해 주세요." },
      { status: 400 },
    );
  }
  const upload = await preparePetPhotoUpload(
    accessToken,
    petId,
    { fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes },
  );
  if (!upload) {
    return NextResponse.json(
      { error: "프로필 사진의 권한, 형식 또는 크기를 확인해 주세요." },
      { status: 403 },
    );
  }
  return NextResponse.json({ upload });
}
