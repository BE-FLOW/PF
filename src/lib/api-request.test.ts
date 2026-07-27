import { describe, expect, it } from "vitest";
import { readJsonBody } from "./api-request";

function request(body: string, contentType = "application/json") {
  return new Request("https://petflow.test/api", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

describe("API JSON body reader", () => {
  it("parses a JSON body within the limit", async () => {
    await expect(readJsonBody(request('{"ok":true}'), 64)).resolves.toEqual({
      ok: true,
      value: { ok: true },
    });
  });

  it("rejects unsupported content types and oversized bodies", async () => {
    const unsupported = await readJsonBody(request("{}", "text/plain"), 64);
    expect(unsupported).toMatchObject({ ok: false, status: 415 });

    const oversized = await readJsonBody(request(JSON.stringify("가".repeat(30))), 32);
    expect(oversized).toMatchObject({ ok: false, status: 413 });
  });

  it("rejects malformed JSON", async () => {
    const result = await readJsonBody(request("{"), 64);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("stops reading a streamed body once the byte limit is exceeded", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"note":"'));
        controller.enqueue(encoder.encode("가".repeat(20)));
        controller.enqueue(encoder.encode('"}'));
        controller.close();
      },
    });
    const streamedRequest = new Request("https://petflow.test/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readJsonBody(streamedRequest, 24)).resolves.toMatchObject({
      ok: false,
      status: 413,
    });
  });
});
