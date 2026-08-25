import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "src", "lib", "supabase-admin.ts"),
  "utf8",
);

describe("free release schema probe", () => {
  it("checks source_revision on the episodes table that owns the column", () => {
    expect(source).toContain(
      'supabaseRequest("episodes?select=id,source_revision&limit=1"',
    );
    expect(source).not.toContain(
      'supabaseRequest("health_reports?select=id,source_revision&limit=1"',
    );
  });
});
