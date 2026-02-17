// ============================================================================
// Edge Function: emit-document
// POST / { mode: "json", document: FacturaElectronica }
// POST / { mode: "xml", xml: string }
//
// Pipeline completo de emisión de documentos fiscales electrónicos.
// Delega la firma XAdES-BES al signing microservice via HTTP.
// ============================================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { errorResponse, ValidationError } from '../_shared/errors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { validateDocument } from '../_shared/validators/document-validator.ts';
import { facturaElectronicaSchema } from '../_shared/validators/schemas.ts';
import { generateCufe } from '../_shared/cufe.ts';
import { parseXml, buildXml } from '../_shared/xml-utils.ts';
import { signXmlRemote, verifyXmlRemote } from '../_shared/signing-client.ts';
import { storeSignedXml } from '../_shared/storage.ts';
import type {
  FacturaElectronica,
  DocumentRecord,
  EmitResponse,
  ValidationIssue,
} from '../_shared/types.ts';

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
    const body = await req.json();

    // Determinar modo: XML o JSON
    const mode = body.mode ?? (body.xml ? 'xml' : 'json');

    let result: EmitResponse;

    if (mode === 'xml') {
      result = await emitFromXml(body.xml, organizationId, supabase);
    } else {
      result = await emitFromJson(body.document, organizationId, supabase);
    }

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});

// ============================================================================
// Pipeline XML (emisor ya firmó)
// ============================================================================

async function emitFromXml(
  signedXml: string,
  organizationId: string,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<EmitResponse> {
  if (!signedXml || signedXml.length < 50) {
    throw new ValidationError('XML requerido (mínimo 50 caracteres)');
  }

  // 1. Parse XML
  const parsed = parseXml<{ rFE: FacturaElectronica }>(signedXml);
  const doc = parsed.rFE;

  if (!doc) {
    throw new ValidationError('XML no contiene elemento rFE', {
      detail: 'El XML debe contener un elemento raíz <rFE>',
    });
  }

  // 2. Validar reglas de negocio
  const validation = validateDocument(doc);
  if (!validation.isValid) {
    throw new ValidationError('Documento no cumple las reglas de validación', {
      errors: validation.errors,
      warnings: validation.warnings,
    });
  }

  // 3. Verificar firma del emisor (via signing service)
  const verifyResult = await verifyXmlRemote(signedXml);
  if (!verifyResult.isValid) {
    throw new ValidationError('Firma del emisor inválida', {
      errors: verifyResult.errors,
    });
  }

  // 4. PAC firma con su certificado (via signing service)
  const finalXml = await signXmlRemote(signedXml, doc.dId);

  // 5. CUFE ya presente en dId
  const cufe = doc.dId;

  // 6-7. Almacenar y crear registro
  return await storeAndRecord(
    supabase,
    organizationId,
    cufe,
    finalXml,
    doc,
    validation.warnings,
  );
}

// ============================================================================
// Pipeline JSON (PAC firma directamente)
// ============================================================================

async function emitFromJson(
  document: Partial<FacturaElectronica>,
  organizationId: string,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<EmitResponse> {
  if (!document) {
    throw new ValidationError('Se requiere el campo "document"');
  }

  const doc = document as FacturaElectronica;

  // 1. Generar CUFE si no está presente
  if (!doc.dId || doc.dId.trim() === '') {
    const cufe = generateCufe(doc);
    doc.dId = cufe;
  }

  // 2. Validar con Zod
  const zodResult = facturaElectronicaSchema.safeParse(doc);
  if (!zodResult.success) {
    throw new ValidationError('Documento JSON no cumple el schema', {
      errors: zodResult.error.flatten().fieldErrors,
    });
  }

  // 3. Validar reglas de negocio
  const validation = validateDocument(doc);
  if (!validation.isValid) {
    throw new ValidationError('Documento no cumple las reglas de validación', {
      errors: validation.errors,
      warnings: validation.warnings,
    });
  }

  // 4. Construir XML
  const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>';
  const xmlBody = buildXml({ rFE: { '@_xmlns': 'https://dgi.mef.gob.pa', ...doc } });
  const xml = xmlDeclaration + '\n' + xmlBody;

  // 5. PAC firma directamente (via signing service)
  const signedXml = await signXmlRemote(xml, doc.dId);

  // 6-7. Almacenar y crear registro
  return await storeAndRecord(
    supabase,
    organizationId,
    doc.dId,
    signedXml,
    doc,
    validation.warnings,
  );
}

// ============================================================================
// Almacenar y registrar
// ============================================================================

async function storeAndRecord(
  supabase: ReturnType<typeof createServiceClient>,
  organizationId: string,
  cufe: string,
  signedXml: string,
  doc: FacturaElectronica,
  warnings: ValidationIssue[],
): Promise<EmitResponse> {
  // Almacenar XML en Supabase Storage
  const xmlPath = await storeSignedXml(supabase, organizationId, cufe, signedXml);

  // Obtener el ambiente desde env
  const environment = Deno.env.get('DGI_ENVIRONMENT') ?? 'sandbox';

  // Crear registro en la tabla documents
  const record: Partial<DocumentRecord> = {
    cufe,
    organization_id: organizationId,
    doc_type: doc.gDGen.iDoc,
    emitter_ruc: doc.gDGen.gEmis.gRucEmi.dRuc,
    emitter_name: doc.gDGen.gEmis.dNombEm,
    receiver_ruc: doc.gDGen.gDatRec.gRucRec?.dRuc ?? null,
    receiver_name: doc.gDGen.gDatRec.dNombRec ?? null,
    emission_date: doc.gDGen.dFechaEm,
    total_amount: doc.gTot.dVTot,
    total_tax: doc.gTot.dTotITBMS,
    currency: doc.gDGen.gFExp?.cMoneda ?? 'USD',
    status: 'signed',
    xml_storage_path: xmlPath,
    authorization_code: null,
    dgi_response: null,
    validation_warnings: warnings,
    environment,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('documents')
    .insert(record)
    .select('*')
    .single();

  if (insertError || !inserted) {
    throw new Error(`Error al crear registro: ${insertError?.message}`);
  }

  const savedRecord = inserted as DocumentRecord;

  // Nota: queueDgiSubmission (setTimeout) no funciona en Edge Functions.
  // El envío a DGI se implementará con pg_net o Database Webhooks.

  return {
    cufe,
    status: 'signed',
    authorizationCode: null,
    warnings,
    documentId: savedRecord.id,
  };
}
