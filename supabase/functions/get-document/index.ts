// ============================================================================
// Edge Function: get-document
// GET /?id=<uuid>          → Obtiene un documento por ID
// GET /                    → Lista documentos con filtros y paginación
// ============================================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { errorResponse, NotFoundError, ValidationError } from '../_shared/errors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import type {
  DocumentRecord,
  DocumentDetailResponse,
  DocumentListResponse,
} from '../_shared/types.ts';

serve(async (req: Request) => {
  // CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Verificar autenticación
    const { organizationId } = await verifyAuth(req);
    const supabase = createServiceClient();
    const url = new URL(req.url);

    // Determinar si es GET por ID o listado
    const documentId = url.searchParams.get('id');

    if (documentId) {
      // --- GET por ID ---
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .eq('organization_id', organizationId)
        .single();

      if (error || !data) {
        throw new NotFoundError('Documento no encontrado');
      }

      const detail = toDetailResponse(data as DocumentRecord);
      return new Response(JSON.stringify(detail), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // --- Listado con filtros ---
    const status = url.searchParams.get('status') ?? undefined;
    const docType = url.searchParams.get('docType') ?? undefined;
    const emitterRuc = url.searchParams.get('emitterRuc') ?? undefined;
    const dateFrom = url.searchParams.get('dateFrom') ?? undefined;
    const dateTo = url.searchParams.get('dateTo') ?? undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100) : 20;

    let query = supabase
      .from('documents')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (status) query = query.eq('status', status);
    if (docType) query = query.eq('doc_type', docType);
    if (emitterRuc) query = query.eq('emitter_ruc', emitterRuc);
    if (dateFrom) query = query.gte('emission_date', dateFrom);
    if (dateTo) query = query.lte('emission_date', dateTo);

    if (cursor) {
      const { data: cursorDoc } = await supabase
        .from('documents')
        .select('created_at')
        .eq('id', cursor)
        .single();

      if (cursorDoc) {
        query = query.lt('created_at', cursorDoc.created_at);
      }
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Error al listar documentos: ${error.message}`);
    }

    const records = (data ?? []) as DocumentRecord[];
    const hasMore = records.length > limit;
    const visibleRecords = hasMore ? records.slice(0, limit) : records;
    const nextCursor = hasMore && visibleRecords.length > 0
      ? visibleRecords[visibleRecords.length - 1].id
      : null;

    const result: DocumentListResponse = {
      data: visibleRecords.map(toDetailResponse),
      pagination: {
        cursor: nextCursor,
        hasMore,
        limit,
      },
    };

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});

function toDetailResponse(record: DocumentRecord): DocumentDetailResponse {
  return {
    id: record.id,
    cufe: record.cufe,
    docType: record.doc_type,
    emitterRuc: record.emitter_ruc,
    emitterName: record.emitter_name,
    receiverRuc: record.receiver_ruc,
    receiverName: record.receiver_name,
    emissionDate: record.emission_date,
    totalAmount: record.total_amount,
    totalTax: record.total_tax,
    currency: record.currency,
    status: record.status,
    authorizationCode: record.authorization_code,
    dgiResponse: record.dgi_response,
    validationWarnings: record.validation_warnings,
    environment: record.environment,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}
