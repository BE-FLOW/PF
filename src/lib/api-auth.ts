export function accessTokenFromAuthorizationHeader(
  authorization: string | null,
) {
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
}

export function accessTokenFromRequest(request: Request) {
  return accessTokenFromAuthorizationHeader(request.headers.get("authorization"));
}
