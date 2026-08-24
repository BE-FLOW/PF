import { createHash } from "node:crypto";
import { isUuid } from "./report-storage";

export const maxVetDraftReportIds = 60;

export function normalizeVetDraftReportIds(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length > maxVetDraftReportIds ||
    !value.every(
      (item): item is string => typeof item === "string" && isUuid(item),
    )
  ) {
    return null;
  }
  return [...new Set(value.map((item) => item.toLowerCase()))].sort();
}

export function vetDraftIdempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim();
  return value && isUuid(value) ? value.toLowerCase() : null;
}

export function buildVetDraftRequestFingerprint(
  episodeId: string,
  reportIds: string[],
  sourceRevision: number,
) {
  const normalizedEpisodeId = episodeId.toLowerCase();
  const normalizedReportIds = normalizeVetDraftReportIds(reportIds);
  if (
    !isUuid(normalizedEpisodeId) ||
    !normalizedReportIds ||
    !Number.isSafeInteger(sourceRevision) ||
    sourceRevision < 0
  ) {
    return null;
  }
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: 2,
        episodeId: normalizedEpisodeId,
        reportIds: normalizedReportIds,
        sourceRevision,
      }),
    )
    .digest("hex");
}

export function reportIdsFromSearchParams(searchParams: URLSearchParams):
  | { provided: boolean; ids: string[] }
  | { error: string } {
  const rawValues = searchParams.getAll("reportIds");
  if (!rawValues.length) return { provided: false, ids: [] };
  const splitValues = rawValues.flatMap((value) => value.split(","));
  if (splitValues.some((value) => !value.trim())) {
    return { error: "선택한 기록 범위를 다시 확인해 주세요." };
  }
  const ids = normalizeVetDraftReportIds(
    splitValues.map((value) => value.trim()),
  );
  return ids
    ? { provided: true, ids }
    : { error: "선택한 기록 범위를 다시 확인해 주세요." };
}
