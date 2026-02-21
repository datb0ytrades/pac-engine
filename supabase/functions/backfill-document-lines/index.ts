// ============================================================================
// Edge Function: backfill-document-lines
// POST / → Pobla document_lines para documentos existentes que no tienen líneas.
// Lee el XML de cada documento desde storage, parsea gItem e inserta en document_lines.
// ============================================================================

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { errorResponse } from '../_shared/errors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { retrieveSignedXml } from '../_shared/storage.ts';
import { parseXml } from '../_shared/xml-utils.ts';
import { ITBMS_RATE_MAP } from '../_shared/types.ts';

interface GItemRow {
  dSecItem?: number;
  dDescProd?: string;
  dCantCodInt?: number;
  gPrecios?: { dPrUnit?: number; dPrItem?: number; dValTotItem?: number };
  gITBMSItem?: { dTasaITBMS?: string; dValITBMS?: number };
}

function normalizeGItem(gItem: unknown): GItemRow[] {
  if (!gItem) return [];
  if (Array.isArray(gItem)) return gItem as GItemRow[];
  return [gItem as GItemRow];
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Método no permitido' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    await verifyAuth(req);
    const supabase = createServiceClient();

    const { data: allDocs } = await supabase
      .from('documents')
      .select('id, xml_storage_path, receiver_name, doc_number, total_amount')
      .not('xml_storage_path', 'is', null);

    const { data: existingLines } = await supabase
      .from('document_lines')
      .select('document_id');

    const docsWithLines = new Set((existingLines ?? []).map((r: { document_id: string }) => r.document_id));
    const docsToProcess = (allDocs ?? []).filter(
      (d: { id: string; xml_storage_path: string | null }) =>
        d.xml_storage_path && !docsWithLines.has(d.id),
    );

    const results: { documentId: string; linesInserted: number; error?: string }[] = [];
    let totalLines = 0;

    for (const doc of docsToProcess as Array<{ id: string; xml_storage_path: string }>) {
      try {
        const xml = await retrieveSignedXml(supabase, doc.xml_storage_path);
        const parsed = parseXml<{ rFE?: { gItem?: unknown } }>(xml);
        const docData = parsed?.rFE ?? parsed;
        const gItem = normalizeGItem(docData?.gItem ?? (parsed as { gItem?: unknown })?.gItem);

        if (gItem.length === 0) {
          // Fallback: línea sintética desde total del documento
          const totalAmount = Number((doc as { total_amount?: number }).total_amount ?? 0);
          if (totalAmount > 0) {
            const docWithMeta = doc as { doc_number?: string };
            const { error: fallbackError } = await supabase.from('document_lines').insert({
              document_id: doc.id,
              line_number: 1,
              description: `Factura ${docWithMeta.doc_number ?? doc.id.slice(0, 8)}`,
              quantity: 1,
              unit_price: totalAmount,
              itbms_rate: 0,
              itbms_amount: 0,
              line_total: totalAmount,
            });
            if (!fallbackError) {
              totalLines += 1;
              results.push({ documentId: doc.id, linesInserted: 1 });
            } else {
              results.push({ documentId: doc.id, linesInserted: 0, error: fallbackError.message });
            }
          } else {
            results.push({ documentId: doc.id, linesInserted: 0, error: 'Sin gItem en XML y total=0' });
          }
          continue;
        }

        const linesToInsert = gItem.map((item: GItemRow) => {
          const precios = item.gPrecios ?? {};
          const itbms = item.gITBMSItem ?? {};
          const tasaCod = itbms.dTasaITBMS ?? '00';
          const itbmsRate = ITBMS_RATE_MAP[tasaCod] ?? 0;
          return {
            document_id: doc.id,
            line_number: item.dSecItem ?? 0,
            description: (item.dDescProd ?? '').slice(0, 500),
            quantity: item.dCantCodInt ?? 0,
            unit_price: precios.dPrUnit ?? 0,
            itbms_rate: itbmsRate,
            itbms_amount: itbms.dValITBMS ?? 0,
            line_total: precios.dValTotItem ?? 0,
          };
        });

        const { error: linesError } = await supabase
          .from('document_lines')
          .insert(linesToInsert);

        if (linesError) {
          results.push({ documentId: doc.id, linesInserted: 0, error: linesError.message });
        } else {
          totalLines += linesToInsert.length;
          results.push({ documentId: doc.id, linesInserted: linesToInsert.length });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Fallback si falla el XML: línea sintética
        const totalAmount = Number((doc as { total_amount?: number }).total_amount ?? 0);
        if (totalAmount > 0) {
          const docWithMeta = doc as { doc_number?: string };
          const { error: fallbackError } = await supabase.from('document_lines').insert({
            document_id: doc.id,
            line_number: 1,
            description: `Factura ${docWithMeta.doc_number ?? doc.id.slice(0, 8)} (sin detalle)`,
            quantity: 1,
            unit_price: totalAmount,
            itbms_rate: 0,
            itbms_amount: 0,
            line_total: totalAmount,
          });
          if (!fallbackError) {
            totalLines += 1;
            results.push({ documentId: doc.id, linesInserted: 1 });
          } else {
            results.push({ documentId: doc.id, linesInserted: 0, error: msg });
          }
        } else {
          results.push({ documentId: doc.id, linesInserted: 0, error: msg });
        }
      }
    }

    return new Response(
      JSON.stringify({
        documentsProcessed: docsToProcess.length,
        totalLinesInserted: totalLines,
        results,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
