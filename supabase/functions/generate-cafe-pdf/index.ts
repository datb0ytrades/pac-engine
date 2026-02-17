// ============================================================================
// Edge Function: generate-cafe-pdf
// GET /?id=<uuid>  → Genera o recupera el CAFE en PDF
// ============================================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { errorResponse, NotFoundError, ValidationError } from '../_shared/errors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { generateCafePdf } from '../_shared/pdf.ts';
import { storeCafePdf } from '../_shared/storage.ts';
import type { DocumentRecord } from '../_shared/types.ts';

serve(async (req: Request) => {
  // CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Verificar autenticación
    const { organizationId } = await verifyAuth(req);
    const supabase = createServiceClient();
    const url = new URL(req.url);

    const documentId = url.searchParams.get('id');
    if (!documentId) {
      throw new ValidationError('Se requiere el parámetro id');
    }

    // Buscar el documento
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) {
      throw new NotFoundError('Documento no encontrado');
    }

    const record = data as DocumentRecord;

    // Si ya tiene PDF, intentar recuperarlo
    if (record.pdf_storage_path) {
      const { data: pdfData, error: dlError } = await supabase.storage
        .from('pdf-cafe')
        .download(record.pdf_storage_path);

      if (!dlError && pdfData) {
        const arrayBuffer = await pdfData.arrayBuffer();
        return new Response(new Uint8Array(arrayBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="CAFE-${documentId}.pdf"`,
            ...corsHeaders,
          },
        });
      }
      // Si falla la descarga, regenerar
    }

    // Generar PDF
    const pdfData = await generateCafePdf(record);

    // Almacenar en storage
    const pdfPath = await storeCafePdf(supabase, organizationId, record.cufe, pdfData);

    // Actualizar registro con la ruta del PDF
    await supabase
      .from('documents')
      .update({ pdf_storage_path: pdfPath })
      .eq('id', documentId);

    return new Response(pdfData, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="CAFE-${documentId}.pdf"`,
        ...corsHeaders,
      },
    });
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
