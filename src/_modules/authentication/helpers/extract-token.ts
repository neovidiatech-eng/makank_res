import { Request } from 'express';

function getToken(bearer: string): string | undefined {
  const parts = bearer.split(' ');
  return parts.length === 2 ? parts[1] : undefined;
}

export function extractJWT(req: Request): string | undefined {
  const authorizationHeader = req.headers?.authorization;
  if (authorizationHeader) {
    const token = getToken(authorizationHeader);
    if (token) return token;
  }

  const customHeader = (req.headers?.refreshtoken || req.headers?.['refresh-token']) as string | undefined;
  if (customHeader) {
    const token = customHeader.startsWith('Bearer ') ? getToken(customHeader) : customHeader;
    if (token) return token;
  }

  if (req.body?.refreshToken || req.body?.RefreshToken) {
    const bodyToken = req.body.refreshToken || req.body.RefreshToken;
    const token = bodyToken.startsWith('Bearer ') ? getToken(bodyToken) : bodyToken;
    if (token) return token;
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
