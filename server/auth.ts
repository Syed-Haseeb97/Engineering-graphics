import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SupabaseJwtPayload {
  readonly sub: string; // User UUID
  readonly email: string;
  readonly role?: string; // 'authenticated' | 'anon' | 'service_role'
  readonly app_metadata?: {
    readonly provider?: string;
    readonly roles?: readonly string[];
    [key: string]: unknown;
  };
  readonly user_metadata?: {
    readonly roll_no?: string;
    readonly name?: string;
    readonly section?: string;
    [key: string]: unknown;
  };
  readonly exp: number;
  readonly iat: number;
}

export class AuthenticationError extends Error {
  constructor(message: string, public readonly statusCode = 401) {
    super(`AUTH_ERROR: ${message}`);
    this.name = 'AuthenticationError';
  }
}

/**
 * Base64URL decode string to UTF-8.
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Base64URL encode Buffer or string.
 */
export function base64UrlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Create signed HMAC-SHA256 JWT for local testing and authentication mocks.
 */
export function createTestJwt(
  payload: Omit<SupabaseJwtPayload, 'exp' | 'iat'> & { exp?: number; iat?: number },
  secret: string,
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const nowSec = Math.floor(Date.now() / 1000);
  const fullPayload: SupabaseJwtPayload = {
    exp: nowSec + 3600, // 1 hour default expiration
    iat: nowSec,
    ...payload,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const hmac = createHmac('sha256', secret);
  hmac.update(data);
  const signature = base64UrlEncode(hmac.digest());

  return `${data}.${signature}`;
}

/**
 * Extract Bearer token from HTTP Authorization header.
 */
export function extractBearerToken(authHeader: string | undefined): string {
  if (!authHeader) {
    throw new AuthenticationError('Missing Authorization header. Expected Bearer token.');
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer' || !parts[1]) {
    throw new AuthenticationError('Invalid Authorization header format. Expected "Bearer <token>".');
  }

  return parts[1];
}

/**
 * Verify cryptographic signature and claims of a Supabase JWT.
 * Guarantees student identity is extracted strictly from the cryptographic token.
 */
export function verifySupabaseJwt(token: string, secret: string): SupabaseJwtPayload {
  const segments = token.split('.');
  if (segments.length !== 3) {
    throw new AuthenticationError('Malformed JWT token.');
  }

  const [headerB64, payloadB64, signatureB64] = segments as [string, string, string];

  // 1. Verify Signature
  const data = `${headerB64}.${payloadB64}`;
  const hmac = createHmac('sha256', secret);
  hmac.update(data);
  const expectedSignature = base64UrlEncode(hmac.digest());

  const sigA = Buffer.from(signatureB64, 'utf8');
  const sigB = Buffer.from(expectedSignature, 'utf8');

  if (sigA.length !== sigB.length || !timingSafeEqual(sigA, sigB)) {
    throw new AuthenticationError('Invalid JWT token signature.');
  }

  // 2. Parse Payload
  let payload: SupabaseJwtPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64)) as SupabaseJwtPayload;
  } catch {
    throw new AuthenticationError('Failed to parse JWT payload.');
  }

  // 3. Expiration Check
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < nowSec) {
    throw new AuthenticationError('JWT token has expired.');
  }

  if (!payload.sub) {
    throw new AuthenticationError('JWT token is missing "sub" (user id) claim.');
  }

  return payload;
}
