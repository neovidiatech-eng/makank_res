import { Request } from 'express';
import * as requestIp from 'request-ip';
export function getClientIp(request: Request): string {
  // Check standard headers (for proxy environments)
  const headers = [
    'x-client-ip',
    'x-forwarded-for',
    'cf-connecting-ip', // Cloudflare
    'fastly-client-ip', // Fastly
    'x-real-ip', // Nginx
    'x-cluster-client-ip',
    'x-appengine-user-ip', // Google App Engine
  ];

  // Check headers first
  for (const header of headers) {
    const value = request.headers[header];
    if (value) {
      return Array.isArray(value) ? value[0] : value.split(',')[0].trim();
    }
  }

  // Fallback to request-ip or connection info
  return (
    request.clientIp ||
    requestIp.getClientIp(request) ||
    request.socket?.remoteAddress ||
    request.connection?.remoteAddress ||
    'unknown'
  );
}
