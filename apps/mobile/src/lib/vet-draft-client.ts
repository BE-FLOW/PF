export function normalizeVetDraftReportIds(reportIds?: string[]) {
  return [...new Set(reportIds ?? [])].sort();
}

export function vetDraftSelectionKey(episodeId: string, reportIds?: string[]) {
  return `${episodeId}:${normalizeVetDraftReportIds(reportIds).join(",")}`;
}

export function vetDraftSelectionMatches(
  actual: string[] | undefined,
  expected?: string[],
) {
  return (
    JSON.stringify(normalizeVetDraftReportIds(actual)) ===
    JSON.stringify(normalizeVetDraftReportIds(expected))
  );
}

export function vetDraftRecoveryUrl({
  apiBaseUrl,
  episodeId,
  reportIds,
  requestId,
}: {
  apiBaseUrl: string;
  episodeId: string;
  reportIds: string[];
  requestId?: string;
}) {
  const params = new URLSearchParams();
  if (requestId) params.set("requestId", requestId);
  for (const reportId of normalizeVetDraftReportIds(reportIds)) {
    params.append("reportIds", reportId);
  }
  const query = params.toString();
  return `${apiBaseUrl.replace(/\/$/, "")}/api/episodes/${episodeId}/vet-draft${query ? `?${query}` : ""}`;
}
