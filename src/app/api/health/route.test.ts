import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkDatabaseConnection: vi.fn(),
  checkFreeReleaseSchema: vi.fn(),
  freeAiServerConfiguration: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  checkDatabaseConnection: mocks.checkDatabaseConnection,
  checkFreeReleaseSchema: mocks.checkFreeReleaseSchema,
}));

vi.mock("@/lib/ai-access", () => ({
  freeAiServerConfiguration: mocks.freeAiServerConfiguration,
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GIT_COMMIT_SHA", "1234567890abcdef");
    mocks.checkDatabaseConnection.mockResolvedValue("connected");
    mocks.checkFreeReleaseSchema.mockResolvedValue("ready");
    mocks.freeAiServerConfiguration.mockReturnValue({
      freeRelease: true,
      generationConfigured: true,
      dailyLimit: 3,
      dailyAttemptLimit: 9,
    });
  });

  it("reports a healthy free release only when the new schema is ready", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      database: "connected",
      freeReleaseSchema: "ready",
      releaseMode: "free",
      version: "1234567890ab",
    });
  });

  it("degrades when the free-release schema is missing", async () => {
    mocks.checkFreeReleaseSchema.mockResolvedValue("missing");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.freeReleaseSchema).toBe("missing");
  });
});
