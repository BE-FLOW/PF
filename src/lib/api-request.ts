export type JsonBodyResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 413 | 415; error: string };

export async function readJsonBody<T = unknown>(
  request: Request,
  maxBytes = 32 * 1024,
): Promise<JsonBodyResult<T>> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return {
      ok: false,
      status: 415,
      error: "JSON 형식의 요청만 사용할 수 있어요.",
    };
  }

  const contentLength = request.headers.get("content-length");
  const declaredLength = contentLength === null ? null : Number(contentLength);
  if (
    declaredLength !== null &&
    (!Number.isInteger(declaredLength) || declaredLength < 0)
  ) {
    return {
      ok: false,
      status: 400,
      error: "요청 길이 정보가 올바르지 않습니다.",
    };
  }
  if (declaredLength !== null && declaredLength > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: "요청 내용이 너무 커요.",
    };
  }

  try {
    if (!request.body) {
      return {
        ok: false,
        status: 400,
        error: "요청 내용이 비어 있어요.",
      };
    }

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maxBytes) {
        await reader.cancel();
        return {
          ok: false,
          status: 413,
          error: "요청 내용이 너무 커요.",
        };
      }
      chunks.push(value);
    }
    if (!receivedBytes) {
      return {
        ok: false,
        status: 400,
        error: "요청 내용이 비어 있어요.",
      };
    }

    const bytes = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return {
      ok: false,
      status: 400,
      error: "요청 형식이 올바르지 않습니다.",
    };
  }
}
