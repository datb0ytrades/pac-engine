// ============================================================================
// CORS headers para Supabase Edge Functions
// ============================================================================

const ALLOWED_ORIGINS = [
  // Production web portal
  'https://fynza.tech',
  'https://www.fynza.tech',
  // Local development
  'http://localhost:5173',
  'http://localhost:3000',
];

function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get('origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }
  // Mobile apps don't send origin headers — allow them through
  // Supabase client SDK requests also don't require CORS
  return ALLOWED_ORIGINS[0];
}

export function getCorsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

// Backwards-compatible static headers for simple cases
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

/**
 * Maneja la solicitud OPTIONS de preflight.
 * Retorna null si no es un preflight, o una Response vacía si lo es.
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }
  return null;
}
