import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-request";
import { isUuid } from "@/lib/report-storage";
import {
  registerHealthReportMedia,
  type ReportMediaRegistrationInput,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

function isMediaRegistrationInput(value: unknown): value is {
  files: ReportMediaRegistrationInput[];
} {
  if (!value || typeof value !== "object") return false;
  const body = value as {
    files?: unknown;
  };
  return (
    Array.isArray(body.files) &&
    body.files.every((file) => {
      const item = file as Partial<ReportMediaRegistrationInput>;
      return (
        item &&
        typeof item.storagePath === "string" &&
        typeof item.fileName === "string" &&
        typeof item.mimeType === "string" &&
        typeof item.sizeBytes === "number" &&
        (item.kind === "image" || item.kind === "video")
      );
    })
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await context.params;
  const accessToken = accessTokenFromRequest(request);
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  if (!isUuid(reportId)) {
    return NextResponse.json(
      { error: "기록 정보를 다시 확인해 주세요." },
      { status: 400 },
    );
  }
  const parsed = await readJsonBody(request, 12 * 1024);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status },
    );
  }

  if (!isMediaRegistrationInput(parsed.value)) {
    return NextResponse.json(
      { error: "사진·영상 정보를 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const media = await registerHealthReportMedia(
    accessToken,
    reportId,
    parsed.value.files,
  );

  if (!media) {
    return NextResponse.json(
      { error: "첨부 자료를 기록에 연결하지 못했어요." },
      { status: 403 },
    );
  }

  return NextResponse.json({ media });
}
