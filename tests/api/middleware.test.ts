// ============================================================================
// Tests de middleware: error-handler, request-logger, rate-limit
// (auth se testea indirectamente en documents.test.ts)
// ============================================================================

import express from 'express';
import request from 'supertest';

// --- Mocks ---

jest.mock('../../src/config/env', () => ({
  env: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_KEY: 'test-service-key',
    SUPABASE_ANON_KEY: 'test-anon-key',
    DGI_ENVIRONMENT: 'sandbox',
    RATE_LIMIT_WINDOW_MS: 1000, // 1 segundo para tests rápidos
    RATE_LIMIT_MAX_REQUESTS: 3,
    PORT: 3000,
    NODE_ENV: 'test',
  },
}));

import {
  errorHandlerMiddleware,
  ApiHttpError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ConflictError,
  TooManyRequestsError,
} from '../../src/middleware/error-handler';
import { requestLoggerMiddleware } from '../../src/middleware/request-logger';
import { rateLimitMiddleware } from '../../src/middleware/rate-limit';

// ============================================================================
// Error Handler
// ============================================================================

describe('errorHandlerMiddleware', () => {
  function createErrorApp(error: Error) {
    const app = express();
    app.get('/test', (_req, _res, next) => next(error));
    app.use(errorHandlerMiddleware);
    return app;
  }

  it('debería retornar 400 para ValidationError', async () => {
    const app = createErrorApp(new ValidationError('Campo inválido', { field: 'test' }));
    const res = await request(app).get('/test').expect(400);

    expect(res.body.error).toBe('Campo inválido');
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toEqual({ field: 'test' });
  });

  it('debería retornar 404 para NotFoundError', async () => {
    const app = createErrorApp(new NotFoundError('No existe'));
    const res = await request(app).get('/test').expect(404);

    expect(res.body.error).toBe('No existe');
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('debería retornar 401 para UnauthorizedError', async () => {
    const app = createErrorApp(new UnauthorizedError('Sin token'));
    const res = await request(app).get('/test').expect(401);

    expect(res.body.error).toBe('Sin token');
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('debería retornar 409 para ConflictError', async () => {
    const app = createErrorApp(new ConflictError('Ya existe'));
    const res = await request(app).get('/test').expect(409);

    expect(res.body.error).toBe('Ya existe');
    expect(res.body.code).toBe('CONFLICT');
  });

  it('debería retornar 429 para TooManyRequestsError', async () => {
    const app = createErrorApp(new TooManyRequestsError());
    const res = await request(app).get('/test').expect(429);

    expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('debería retornar 500 para errores genéricos', async () => {
    const app = createErrorApp(new Error('Algo falló'));
    const res = await request(app).get('/test').expect(500);

    expect(res.body.error).toBe('Error interno del servidor');
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });

  it('debería soportar statusCode personalizado en ApiHttpError', async () => {
    const app = createErrorApp(new ApiHttpError(418, "I'm a teapot", 'TEAPOT'));
    const res = await request(app).get('/test').expect(418);

    expect(res.body.error).toBe("I'm a teapot");
    expect(res.body.code).toBe('TEAPOT');
  });
});

// ============================================================================
// Error classes
// ============================================================================

describe('Error classes', () => {
  it('ValidationError tiene statusCode 400', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe('ValidationError');
  });

  it('NotFoundError tiene statusCode 404', () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Recurso no encontrado');
  });

  it('UnauthorizedError tiene statusCode 401', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
  });

  it('ConflictError tiene statusCode 409', () => {
    const err = new ConflictError('conflicto');
    expect(err.statusCode).toBe(409);
  });

  it('TooManyRequestsError tiene statusCode 429', () => {
    const err = new TooManyRequestsError();
    expect(err.statusCode).toBe(429);
  });

  it('ApiHttpError es instancia de Error', () => {
    const err = new ApiHttpError(500, 'test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiHttpError);
  });
});

// ============================================================================
// Request Logger
// ============================================================================

describe('requestLoggerMiddleware', () => {
  it('debería loguear el request y dejar pasar', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    const app = express();
    app.use(requestLoggerMiddleware);
    app.get('/test', (_req, res) => res.json({ ok: true }));

    await request(app).get('/test').expect(200);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const logLine = logSpy.mock.calls[0][0] as string;
    expect(logLine).toContain('GET');
    expect(logLine).toContain('/test');
    expect(logLine).toContain('200');
    expect(logLine).toMatch(/\d+ms/);

    logSpy.mockRestore();
  });

  it('debería usar console.error para status 500+', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    const app = express();
    app.use(requestLoggerMiddleware);
    app.get('/fail', (_req, res) => res.status(500).json({ error: 'fail' }));

    await request(app).get('/fail').expect(500);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logLine = errorSpy.mock.calls[0][0] as string;
    expect(logLine).toContain('500');

    errorSpy.mockRestore();
  });
});

// ============================================================================
// Rate Limit
// ============================================================================

describe('rateLimitMiddleware', () => {
  // Usar un orgId único por test para evitar compartir estado del rate limit store
  let testOrgId: string;
  let testCounter = 0;

  function createRateLimitApp(orgId?: string) {
    const id = orgId ?? testOrgId;
    const app = express();
    // Simular auth middleware
    app.use((req, _res, next) => {
      (req as unknown as Record<string, unknown>).organizationId = id;
      next();
    });
    app.use(rateLimitMiddleware as express.RequestHandler);
    app.get('/test', (_req, res) => res.json({ ok: true }));
    return app;
  }

  beforeEach(() => {
    testCounter++;
    testOrgId = `org-rate-test-${testCounter}-${Date.now()}`;
  });

  it('debería permitir requests dentro del límite', async () => {
    const app = createRateLimitApp();

    const res = await request(app).get('/test').expect(200);

    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('debería retornar 429 cuando se excede el límite', async () => {
    const app = createRateLimitApp();

    // Configurado con max=3, hacer 4 requests
    await request(app).get('/test').expect(200);
    await request(app).get('/test').expect(200);
    await request(app).get('/test').expect(200);
    const res = await request(app).get('/test').expect(429);

    expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res.body.retryAfter).toBeDefined();
  });

  it('debería dejar pasar si no hay organizationId', async () => {
    const app = express();
    // Sin auth middleware → no organizationId
    app.use(rateLimitMiddleware as express.RequestHandler);
    app.get('/test', (_req, res) => res.json({ ok: true }));

    await request(app).get('/test').expect(200);
  });

  it('debería incluir headers de rate limit', async () => {
    const app = createRateLimitApp();

    const res = await request(app).get('/test').expect(200);

    expect(Number(res.headers['x-ratelimit-limit'])).toBe(3);
    expect(Number(res.headers['x-ratelimit-remaining'])).toBeGreaterThanOrEqual(0);
  });
});
