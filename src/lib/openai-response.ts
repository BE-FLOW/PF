export function extractResponseOutputText(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const response = data as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  if (response.output_text) return response.output_text;
  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .map((item) => item.text ?? "")
      .join("") || null
  );
}
