import { Request } from 'express';

function getToken(bearer: string): string | undefined {
  const parts = bearer.split(' ');
  return parts.length === 2 ? parts[1] : undefined;
}

export function extractJWT(req: Request): string | undefined {
  const authorizationHeader = req.headers?.authorization;
  if (authorizationHeader) {
    return getToken(authorizationHeader);
  }

  const accessTokenCookieKey = env('ACCESS_TOKEN_COOKIE_KEY');
  if (
    accessTokenCookieKey &&
    req.signedCookies?.[accessTokenCookieKey]?.length > 0
  ) {
    return getToken(`Bearer ${req.signedCookies[accessTokenCookieKey]}`);
  }

  return undefined;
}
