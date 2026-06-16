import type { ReportMediaKind } from "./types";

export const reportMediaBucket = "petflow-report-media";
export const maxReportMediaFiles = 4;
export const maxReportMediaSizeBytes = 50 * 1024 * 1024;
export const allowedReportMediaMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

const allowedReportMediaMimeTypeSet = new Set<string>(
  allowedReportMediaMimeTypes,
);

export const reportMediaAccept = allowedReportMediaMimeTypes.join(",");

export function isAllowedReportMediaMimeType(mimeType: string) {
  return allowedReportMediaMimeTypeSet.has(mimeType);
}

export function reportMediaKindFromMimeType(
  mimeType: string,
): ReportMediaKind | null {
  if (!isAllowedReportMediaMimeType(mimeType)) return null;
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return null;
}

export function reportMediaExtensionFromMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "video/quicktime") return "mov";
  return mimeType.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin";
}

export function countReportMedia(media: Array<{ kind: ReportMediaKind }>) {
  const imageCount = media.filter((item) => item.kind === "image").length;
  const videoCount = media.filter((item) => item.kind === "video").length;
  return { imageCount, videoCount, mediaCount: media.length };
}

export function formatReportMediaCount(
  imageCount: number,
  videoCount: number,
) {
  return [
    imageCount ? `사진 ${imageCount}개` : "",
    videoCount ? `영상 ${videoCount}개` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

export function formatReportMediaSummary(
  media: Array<{ kind: ReportMediaKind }>,
) {
  const { imageCount, videoCount } = countReportMedia(media);
  return formatReportMediaCount(imageCount, videoCount);
}
