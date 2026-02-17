// ============================================================================
// Clases de error y helper de respuesta para Edge Functions
// Adaptado de src/middleware/error-handler.ts (sin Express)
// ============================================================================

// --- Clases de error HTTP ---

export class ApiHttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiHttpError';
  }
}

export class ValidationError extends ApiHttpError {
  constructor(message: string, details?: unknown) {
    super(400, message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApiHttpError {
  constructor(message = 'Recurso no encontrado') {
    super(404, message, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends ApiHttpError {
  constructor(message = 'No autorizado') {
    super(401, message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ConflictError extends ApiHttpError {
  constructor(message: string) {
    super(409, message, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class TooManyRequestsError extends ApiHttpError {
  constructor(message = 'Demasiadas solicitudes') {
    super(429, message, 'RATE_LIMIT_EXCEEDED');
    this.name = 'TooManyRequestsError';
  }
}

// --- Helper para generar Response de error ---

/**
 * Genera una Response JSON a partir de un Error.
 * Si es ApiHttpError, usa su statusCode y code.
 * Si no, retorna 500 con código INTERNAL_ERROR.
 */
export function errorResponse(err: unknown, corsHeaders: HeadersInit = {}): Response {
  if (err instanceof ApiHttpError) {
    const body: Record<string, unknown> = {
      error: err.message,
      code: err.code,
    };
    if (err.details) body.details = err.details;

    return new Response(JSON.stringify(body), {
      status: err.statusCode,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Error no esperado
  const message = err instanceof Error ? err.message : 'Error interno del servidor';
  console.error('[ERROR]', message, err instanceof Error ? err.stack : '');

  return new Response(
    JSON.stringify({
      error: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
    }),
    {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    },
  );
}
