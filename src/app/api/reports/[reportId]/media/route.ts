import { NextResponse } from "next/server";
import { accessTokenFromRequest } from "@/lib/api-auth";
import {
  registerHealthReportMedia,
  type ReportMediaRegistrationInput,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

function isMediaRegistrationInput(value: unknown): value is {
  clientId: string;
  files: ReportMediaRegistrationInput[];
} {
  if (!value || typeof value !== "object") return false;
  const body = value as {
    clientId?: unknown;
    files?: unknown;
  };
  return (
    typeof body.clientId === "string" &&
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "첨부 자료 요청 형식을 확인해 주세요." },
      { status: 400 },
    );
  }

  if (!isMediaRegistrationInput(body)) {
    return NextResponse.json(
      { error: "사진·영상 정보를 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  const media = await registerHealthReportMedia(
    accessTokenFromRequest(request),
    reportId,
    body.clientId,
    body.files,
  );

  if (!media) {
    return NextResponse.json(
      { error: "첨부 자료를 기록에 연결하지 못했어요." },
      { status: 403 },
    );
  }

  return NextResponse.json({ media });
}
