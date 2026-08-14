import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mobileSource = readFileSync(resolve("apps/mobile/App.tsx"), "utf8");
const webSource = readFileSync(resolve("src/components/petflow-app.tsx"), "utf8");
const userFacingSources = `${mobileSource}\n${webSource}`;

describe("current product direction", () => {
  it("keeps the app and web centered on pre-visit preparation", () => {
    expect(mobileSource).toContain('label: "병원 준비"');
    expect(mobileSource).toContain('label: "전달본"');
    expect(webSource).toContain('label: "병원 준비"');
    expect(webSource).toContain('label: "전달본"');
  });

  it("does not restore manual follow-up management in user-facing code", () => {
    expect(userFacingSources).not.toContain("흐름 마무리");
    expect(userFacingSources).not.toContain("경과 이어 기록");
    expect(userFacingSources).not.toContain("SOAP-LOOP · P");
    expect(userFacingSources).not.toContain("최근 14일");
  });
});
