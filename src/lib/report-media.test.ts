import { describe, expect, it } from "vitest";
import {
  countReportMedia,
  formatReportMediaCount,
  formatReportMediaSummary,
  reportMediaExtensionFromMimeType,
  reportMediaKindFromMimeType,
} from "./report-media";

describe("report media helpers", () => {
  it("maps supported mime types to report media kinds", () => {
    expect(reportMediaKindFromMimeType("image/jpeg")).toBe("image");
    expect(reportMediaKindFromMimeType("video/mp4")).toBe("video");
    expect(reportMediaKindFromMimeType("application/pdf")).toBeNull();
  });

  it("counts and labels uploaded media consistently", () => {
    const media = [{ kind: "image" as const }, { kind: "video" as const }];

    expect(countReportMedia(media)).toEqual({
      imageCount: 1,
      videoCount: 1,
      mediaCount: 2,
    });
    expect(formatReportMediaSummary(media)).toBe("사진 1개, 영상 1개");
    expect(formatReportMediaCount(0, 2)).toBe("영상 2개");
  });

  it("uses stable storage extensions for common mobile media", () => {
    expect(reportMediaExtensionFromMimeType("image/jpeg")).toBe("jpg");
    expect(reportMediaExtensionFromMimeType("video/quicktime")).toBe("mov");
  });
});
