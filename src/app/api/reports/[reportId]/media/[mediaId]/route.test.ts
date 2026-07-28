import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteHealthReportMedia } = vi.hoisted(() => ({
  deleteHealthReportMedia: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({ deleteHealthReportMedia }));

import { DELETE } from "./route";

const reportId = "11111111-1111-4111-8111-111111111111";
const mediaId = "22222222-2222-4222-8222-222222222222";
const accessToken = "eyJhbGciOiJIUzI1NiJ9.payload.signature";

describe("DELETE /api/reports/[reportId]/media/[mediaId]", () => {
  beforeEach(() => {
    deleteHealthReportMedia.mockReset();
  });

  it("rejects invalid attachment identifiers before deletion", async () => {
    const request = new Request("http://localhost/api/reports/x/media/y", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const response = await DELETE(request, {
      params: Promise.resolve({ reportId, mediaId: "invalid" }),
    });

    expect(response.status).toBe(400);
    expect(deleteHealthReportMedia).not.toHaveBeenCalled();
  });

  it("deletes an owned attachment through the server helper", async () => {
    deleteHealthReportMedia.mockResolvedValue(true);
    const request = new Request(
      `http://localhost/api/reports/${reportId}/media/${mediaId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ reportId, mediaId }),
    });

    expect(response.status).toBe(200);
    expect(deleteHealthReportMedia).toHaveBeenCalledWith(
      accessToken,
      reportId,
      mediaId,
    );
    await expect(response.json()).resolves.toEqual({ deleted: true });
  });
});
