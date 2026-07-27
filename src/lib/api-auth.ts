export function accessTokenFromAuthorizationHeader(
  authorization: string | null,
) {
  if (!authorization || authorization.length > 8192) return null;
  const match = /^Bearer ([^\s,]+)$/i.exec(authorization.trim());
  const token = match?.[1] ?? "";
  return token.length >= 20 ? token : null;
}

export function accessTokenFromRequest(request: Request) {
  return accessTokenFromAuthorizationHeader(request.headers.get("authorization"));
}
