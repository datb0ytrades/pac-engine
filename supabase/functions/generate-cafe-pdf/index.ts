// ============================================================================
// Edge Function: generate-cafe-pdf
// GET /?id=<uuid> o ?cufe=<cufe>  → Genera o recupera el CAFE en PDF
// ============================================================================

// Entry point: Deno.serve()
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { errorResponse, NotFoundError, ValidationError, ForbiddenError } from '../_shared/errors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { generateCafePdf } from '../_shared/pdf.ts';
import { storeCafePdf } from '../_shared/storage.ts';
import type { DocumentRecord } from '../_shared/types.ts';

Deno.serve(async (req: Request) => {
  // CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Verificar autenticación
    const { userId } = await verifyAuth(req);
    const supabase = createServiceClient();
    const url = new URL(req.url);

    // Obtener org_id del perfil del usuario
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.org_id) {
      throw new ForbiddenError('Usuario no asociado a ninguna organización');
    }

    const organizationId = profile.org_id as string;

    let documentId = url.searchParams.get('id');
    let cufe = url.searchParams.get('cufe');
    if (!documentId && !cufe && req.method === 'POST') {
      try {
        const body = (await req.json()) as { documentId?: string; id?: string };
        documentId = body.documentId ?? body.id ?? undefined;
      } catch {
        // ignore parse error
      }
    }
    if (!documentId && !cufe) {
      throw new ValidationError('Se requiere el parámetro id o cufe, o body con documentId');
    }

    // Buscar el documento por ID o CUFE
    let query = supabase
      .from('documents')
      .select('*')
      .eq('org_id', organizationId);
    if (documentId) {
      query = query.eq('id', documentId);
    } else {
      query = query.eq('cufe', cufe!);
    }
    const { data, error } = await query.single();

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
            'Content-Disposition': `inline; filename="CAFE-${record.id}.pdf"`,
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
      .eq('id', record.id);

    return new Response(pdfData, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="CAFE-${record.id}.pdf"`,
        ...corsHeaders,
      },
    });
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
