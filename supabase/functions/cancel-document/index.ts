// ============================================================================
// Edge Function: cancel-document
// POST / { documentId: string, reason: string }
// Anula un documento fiscal electrónico
// ============================================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import {
  errorResponse,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../_shared/errors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import type { DocumentRecord, DocumentDetailResponse } from '../_shared/types.ts';

serve(async (req: Request) => {
  // CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Método no permitido', code: 'METHOD_NOT_ALLOWED' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Verificar autenticación
    const { organizationId } = await verifyAuth(req);
    const supabase = createServiceClient();

    // Parsear body
    const body = await req.json();
    const documentId = body.documentId as string;
    const reason = body.reason as string;

    if (!documentId) {
      throw new ValidationError('Se requiere documentId');
    }
    if (!reason || reason.length < 10) {
      throw new ValidationError('Motivo de anulación debe tener al menos 10 caracteres');
    }
    if (reason.length > 500) {
      throw new ValidationError('Motivo de anulación no puede exceder 500 caracteres');
    }

    // Verificar que el documento existe y pertenece a la organización
    const { data: existing, error: findError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('organization_id', organizationId)
      .single();

    if (findError || !existing) {
      throw new NotFoundError('Documento no encontrado');
    }

    const record = existing as DocumentRecord;

    if (record.status === 'cancelled') {
      throw new ConflictError('El documento ya está anulado');
    }

    if (record.status !== 'accepted' && record.status !== 'signed') {
      throw new ConflictError(
        `No se puede anular un documento en estado "${record.status}". ` +
        'Solo se pueden anular documentos aceptados o firmados.',
      );
    }

    // Actualizar el registro
    const { data: updated, error: updateError } = await supabase
      .from('documents')
      .update({
        status: 'cancelled',
        cancelled_reason: reason,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', documentId)
      .select('*')
      .single();

    if (updateError || !updated) {
      throw new Error(`Error al anular documento: ${updateError?.message}`);
    }

    const detail = toDetailResponse(updated as DocumentRecord);

    return new Response(JSON.stringify(detail), {
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
