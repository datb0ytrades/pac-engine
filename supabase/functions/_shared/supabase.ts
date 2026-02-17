// ============================================================================
// Supabase client para Edge Functions
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Crea un cliente Supabase con la service role key.
 * Tiene acceso completo, saltando RLS. Usar solo para operaciones del servidor.
 */
export function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/**
 * Crea un cliente Supabase con la anon key.
 * Usado para verificar tokens JWT del usuario.
 */
export function createAnonClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );
}
