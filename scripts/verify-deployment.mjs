import { randomUUID } from "node:crypto";

const target = process.argv[2]?.replace(/\/$/, "");
if (!target) {
  console.error(
    "Usage: npm run verify:deployment -- https://preview-url.vercel.app",
  );
  process.exit(1);
}

async function readJson(path, init) {
  const response = await fetch(`${target}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `${path} returned ${response.status}: ${JSON.stringify(body)}`,
    );
  }
  return body;
}

const health = await readJson("/api/health");
if (health.database !== "connected") {
  throw new Error(`Database is ${health.database}; expected connected.`);
}

const clientId = randomUUID();
const analysis = await readJson("/api/analyze", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-petflow-client-id": clientId,
    "x-petflow-test": "true",
  },
  body: JSON.stringify({
    petName: "배포검증",
    species: "dog",
    breed: "test",
    ageGroup: "adult",
    symptoms: [],
    appetite: "normal",
    energy: "normal",
    duration: "today",
    redFlags: [],
    note: "",
  }),
});

if (analysis.storage !== "remote") {
  throw new Error(
    "Analysis succeeded but the test record was not stored remotely.",
  );
}

const feedback = await readJson("/api/feedback", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    reportId: analysis.id,
    clientId,
    feedback: "helpful",
  }),
});

if (!feedback.saved) {
  throw new Error("Feedback endpoint did not persist the test feedback.");
}

console.log(
  JSON.stringify(
    {
      target,
      database: health.database,
      environment: health.environment,
      version: health.version,
      reportId: analysis.id,
      result: "ok",
    },
    null,
    2,
  ),
);
