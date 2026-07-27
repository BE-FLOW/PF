const nonDeliverableDomains = new Set([
  "example.com",
  "example.net",
  "example.org",
  "example.test",
  "localhost",
]);

export function isDummyEmail(email) {
  if (typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  const parts = normalized.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const domain = parts[1];

  return (
    nonDeliverableDomains.has(domain) ||
    domain.endsWith(".test") ||
    domain.endsWith(".invalid")
  );
}
