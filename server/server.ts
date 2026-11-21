import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { DraftEntity } from '../src/draft/types';
import type { UserRole } from './db/types';
import { extractBearerToken, verifySupabaseJwt, type SupabaseJwtPayload } from './auth';
import { GradingService, ServiceError } from './grading-service';
import { serverLogger } from './logger';

export interface AppConfig {
  readonly jwtSecret: string;
  readonly maxPayloadBytes?: number; // Default 256 KB
}

/**
 * Read request body with streaming size-limit enforcement.
 */
function readJsonBody(
  req: IncomingMessage,
  maxBytes = 256 * 1024,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let bytesReceived = 0;
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => {
      bytesReceived += chunk.length;
      if (bytesReceived > maxBytes) {
        req.destroy();
        reject(new ServiceError(`Request payload exceeds maximum allowed size (${maxBytes} bytes).`, 413, 'PAYLOAD_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const bodyStr = Buffer.concat(chunks).toString('utf8');
        const parsed = JSON.parse(bodyStr) as Record<string, unknown>;
        resolve(parsed);
      } catch {
        reject(new ServiceError('Invalid JSON in request body.', 400, 'INVALID_JSON'));
      }
    });

    req.on('error', (err) => {
      reject(new ServiceError(`Failed to read request body: ${err.message}`, 400, 'READ_ERROR'));
    });
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const jsonStr = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(jsonStr),
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(jsonStr);
}

/**
 * Create HTTP request handler for the Engineering Graphics Grading API.
 */
export function createGradingHandler(
  service: GradingService,
  config: AppConfig,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const maxPayload = config.maxPayloadBytes ?? 256 * 1024;

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const startTime = Date.now();
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method?.toUpperCase() ?? 'GET';

    try {
      // 1. Verify Supabase JWT on all routes
      const authHeader = req.headers['authorization'];
      const token = extractBearerToken(authHeader);
      const jwtPayload: SupabaseJwtPayload = verifySupabaseJwt(token, config.jwtSecret);

      // Route 0: POST /auth/login (Record login event in audit log)
      if (method === 'POST' && pathname === '/auth/login') {
        const body = await readJsonBody(req, maxPayload);
        const result = await service.recordLogin(jwtPayload, body);
        sendJson(res, 200, result);
        return;
      }

      // Route 1: POST /attempts (Create attempt)
      if (method === 'POST' && pathname === '/attempts') {
        const body = await readJsonBody(req, maxPayload);
        const assignmentId = body['assignment_id'] as string;
        if (!assignmentId) {
          throw new ServiceError('Missing required field "assignment_id".', 400, 'MISSING_FIELD');
        }

        const result = await service.createAttempt(jwtPayload, assignmentId);
        sendJson(res, 201, result);
        return;
      }

      // Route 2: POST /attempts/:id/check (Preview check with hints, rate limited)
      const checkMatch = pathname.match(/^\/attempts\/([^/]+)\/check$/);
      if (method === 'POST' && checkMatch) {
        const attemptId = checkMatch[1]!;
        const body = await readJsonBody(req, maxPayload);
        const drawingJson = (body['drawing_json'] ?? {}) as { entities?: readonly DraftEntity[] };

        const result = await service.previewCheck(jwtPayload, attemptId, drawingJson);
        sendJson(res, 200, result);
        return;
      }

      // Route 3: POST /attempts/:id/submit (Final grade & submission, idempotent)
      const submitMatch = pathname.match(/^\/attempts\/([^/]+)\/submit$/);
      if (method === 'POST' && submitMatch) {
        const attemptId = submitMatch[1]!;
        const body = await readJsonBody(req, maxPayload);
        const drawingJson = (body['drawing_json'] ?? {}) as { entities?: readonly DraftEntity[] };

        const result = await service.submitAttempt(jwtPayload, attemptId, drawingJson);
        sendJson(res, 200, result);
        return;
      }

      // Route 4: GET /attempts/:id (View own attempt)
      const getAttemptMatch = pathname.match(/^\/attempts\/([^/]+)$/);
      if (method === 'GET' && getAttemptMatch) {
        const attemptId = getAttemptMatch[1]!;
        const result = await service.getAttempt(jwtPayload, attemptId);
        sendJson(res, 200, result);
        return;
      }

      // Route 5: POST /grades/:id/override (Faculty override endpoint)
      const overrideMatch = pathname.match(/^\/grades\/([^/]+)\/override$/);
      if (method === 'POST' && overrideMatch) {
        const gradeId = overrideMatch[1]!;
        const body = await readJsonBody(req, maxPayload);
        const score = Number(body['score']);
        if (isNaN(score) || score < 0 || score > 100) {
          throw new ServiceError('Field "score" must be a number between 0 and 100.', 400, 'INVALID_SCORE');
        }

        const result = await service.facultyOverride(jwtPayload, gradeId, {
          score,
          feedback: body['feedback'] as string | undefined,
        });
        sendJson(res, 200, result);
        return;
      }

      // Route 6: GET /admin/export-everything (Admin-only institutional data export)
      if (method === 'GET' && pathname === '/admin/export-everything') {
        const result = await service.exportEverything(jwtPayload);
        sendJson(res, 200, result);
        return;
      }

      // Route 7: POST /users/:id/role (Admin-only role change)
      const roleMatch = pathname.match(/^\/users\/([^/]+)\/role$/);
      if (method === 'POST' && roleMatch) {
        const targetUserId = roleMatch[1]!;
        const body = await readJsonBody(req, maxPayload);
        const role = body['role'] as UserRole;
        if (!role || !['student', 'instructor', 'admin'].includes(role)) {
          throw new ServiceError(
            'Field "role" must be one of: "student", "instructor", "admin".',
            400,
            'INVALID_ROLE',
          );
        }

        const result = await service.changeUserRole(jwtPayload, targetUserId, role);
        sendJson(res, 200, result);
        return;
      }

      // Route 8: POST /admin/purge-data (Admin-only data retention enforcement)
      if (method === 'POST' && pathname === '/admin/purge-data') {
        const body = await readJsonBody(req, maxPayload);
        const retentionDays = Number(body['retentionDays'] ?? 180);
        if (isNaN(retentionDays) || retentionDays < 1) {
          throw new ServiceError(
            'Field "retentionDays" must be a positive integer.',
            400,
            'INVALID_RETENTION_DAYS',
          );
        }

        const result = await service.purgeExpiredData(jwtPayload, retentionDays);
        sendJson(res, 200, result);
        return;
      }

      // Route Not Found
      sendJson(res, 404, {
        error: `Route ${method} ${pathname} not found.`,
        code: 'NOT_FOUND',
      });
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const isServiceErr = err instanceof ServiceError;
      const statusCode = isServiceErr ? err.statusCode : (err as { statusCode?: number }).statusCode ?? 500;
      const code = isServiceErr ? err.code : 'INTERNAL_SERVER_ERROR';
      const message = err instanceof Error ? err.message : 'Unknown server error.';

      serverLogger.error('API_REQUEST_ERROR', {
        method,
        pathname,
        statusCode,
        code,
        durationMs,
        error: message,
      });

      sendJson(res, statusCode, {
        error: message,
        code,
      });
    }
  };
}

/**
 * Create standalone HTTP Server instance.
 */
export function createGradingServer(service: GradingService, config: AppConfig): Server {
  return createServer(createGradingHandler(service, config));
}
