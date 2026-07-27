const target = process.argv[2]?.replace(/\/$/, "");
if (!target) {
  console.error(
    "Usage: npm run verify:deployment -- https://preview-url.vercel.app",
  );
  process.exit(1);
}

async function requestJson(path, init) {
  const response = await fetch(`${target}${path}`, init);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

const healthResult = await requestJson("/api/health");
if (!healthResult.response.ok) {
  throw new Error(`/api/health returned ${healthResult.response.status}`);
}
if (healthResult.body.status !== "ok") {
  throw new Error(`Deployment health is ${healthResult.body.status ?? "unknown"}.`);
}
if (healthResult.body.database !== "connected") {
  throw new Error(
    `Deployment database is ${healthResult.body.database ?? "unknown"}.`,
  );
}
if (healthResult.body.billing !== "configured") {
  throw new Error(
    `Deployment billing is ${healthResult.body.billing ?? "unknown"}.`,
  );
}

const unauthorized = await requestJson("/api/analyze", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-petflow-pet-id": "30000000-0000-4000-8000-000000000001",
  },
  body: JSON.stringify({
    petName: "배포검증",
    species: "dog",
    ageGroup: "adult",
    symptoms: [],
    appetite: "normal",
    energy: "normal",
    duration: "today",
    redFlags: [],
    note: "",
  }),
});
if (unauthorized.response.status !== 401) {
  throw new Error(
    `Unauthenticated analysis returned ${unauthorized.response.status}; expected 401.`,
  );
}

console.log(
  JSON.stringify(
    {
      target,
      health: healthResult.body.status,
      billing: healthResult.body.billing,
      version: healthResult.body.version,
      anonymousWriteBlocked: true,
      result: "ok",
    },
    null,
    2,
  ),
);
