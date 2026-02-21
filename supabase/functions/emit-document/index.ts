// ============================================================================
// Edge Function: emit-document
// POST / { mode: "json", document: FacturaElectronica }  → formato DGI completo
// POST / { docType, branchCode, client, items }           → formato simplificado
// POST / { mode: "xml", xml: string }
//
// Pipeline completo de emisión de documentos fiscales electrónicos.
// Delega la firma XAdES-BES al signing microservice via HTTP.
// ============================================================================

// Entry point: Deno.serve()
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { errorResponse, ValidationError, ForbiddenError } from '../_shared/errors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { validateDocument } from '../_shared/validators/document-validator.ts';
import { facturaElectronicaSchema } from '../_shared/validators/schemas.ts';
import { generateCufe } from '../_shared/cufe.ts';
import { parseXml, buildXml } from '../_shared/xml-utils.ts';
import { signXmlRemote, verifyXmlRemote } from '../_shared/signing-client.ts';
import { storeSignedXml } from '../_shared/storage.ts';
import {
  type FacturaElectronica,
  type DocumentRecord,
  type EmitResponse,
  type ValidationIssue,
  ITBMS_RATE_MAP,
} from '../_shared/types.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

// --- Formato simplificado ---

interface SimplifiedClient {
  ruc: string;
  name: string;
  type?: 'natural' | 'juridico';
}

interface SimplifiedItem {
  description: string;
  quantity: number;
  unitPrice: number;
  itbmsRate?: number;
}

interface SimplifiedInput {
  docType: string;
  branchCode: string;
  client: SimplifiedClient;
  items: SimplifiedItem[];
}

// --- Mapeo docType simplificado → código DGI ---
const DOC_TYPE_MAP: Record<string, string> = {
  FE: '01',
  NC: '04',
  ND: '05',
  '01': '01',
  '04': '04',
  '05': '05',
};

// --- Ubicación por defecto Panama ---
const DEFAULT_UBICACION = {
  dCodUbi: '08001001',
  dCorreg: 'San Felipe',
  dDistr: 'Panama',
  dProv: 'Panama',
};

/**
 * Parsea RUC "8-888-888" a componentes DGI: dTipoRuc, dRuc, dDV
 */
function parseRuc(ruc: string): { dTipoRuc: string; dRuc: string; dDV: string } {
  const clean = ruc.replace(/-/g, '').replace(/\s/g, '');
  if (clean.length < 2) {
    return {
      dTipoRuc: '1',
      dRuc: ruc.padEnd(20, '0').slice(0, 20),
      dDV: '0',
    };
  }
  const tipoRuc = clean[0] === '8' ? '1' : clean[0] === '9' ? '2' : '1';
  const dRuc = clean.length > 2 ? clean.slice(0, -2) : clean;
  const dDV = clean.length >= 2 ? clean.slice(-2) : '0';
  return {
    dTipoRuc: tipoRuc,
    dRuc: dRuc.slice(0, 20),
    dDV: dDV.slice(0, 2),
  };
}

/**
 * Obtiene datos del emisor desde el último documento de la org, o usa valores por defecto.
 */
async function getEmitterForOrg(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{
  gRucEmi: { dTipoRuc: string; dRuc: string; dDV: string };
  dNombEm: string;
  dSucEm: string;
  dCoordEm: string;
  dDirecEm: string;
  gUbiEm: { dCodUbi: string; dCorreg: string; dDistr: string; dProv: string };
}> {
  const { data } = await supabase
    .from('documents')
    .select('emitter_ruc, emitter_name')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const ruc = (data?.emitter_ruc ?? '8-1234567-1-01').toString();
  const parsed = parseRuc(ruc);
  return {
    gRucEmi: parsed,
    dNombEm: (data?.emitter_name ?? 'Emisor PAC Sandbox').slice(0, 200),
    dSucEm: '0001',
    dCoordEm: '',
    dDirecEm: 'Calle Principal 1',
    gUbiEm: DEFAULT_UBICACION,
  };
}

/**
 * Genera el próximo número secuencial de documento para la org y sucursal.
 */
async function getNextDocNumber(
  supabase: SupabaseClient,
  orgId: string,
  branchCode: string,
  docTypeCode: string,
): Promise<string> {
  const ptoFac = branchCode.padStart(3, '0').slice(0, 3);
  const prefix = ptoFac;

  const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
  const { count } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('doc_type', docTypeCode)
    .gte('created_at', todayStart);

  const seq = String((count ?? 0) + 1).padStart(7, '0');
  return prefix + seq;
}

/**
 * Convierte formato simplificado a FacturaElectronica (DGI).
 */
async function translateToFEFormat(
  input: SimplifiedInput,
  orgId: string,
  supabase: SupabaseClient,
): Promise<Partial<FacturaElectronica>> {
  if (!input.client?.ruc || !input.client?.name) {
    throw new ValidationError('client.ruc y client.name son requeridos');
  }
  if (!input.items?.length) {
    throw new ValidationError('items no puede estar vacío');
  }

  const docTypeCode = DOC_TYPE_MAP[input.docType] ?? '01';
  const branchCode = input.branchCode.padStart(3, '0').slice(0, 3);
  const dFechaEm = new Date().toISOString().slice(0, 10);

  const emitter = await getEmitterForOrg(supabase, orgId);
  const dNroDF = await getNextDocNumber(
    supabase,
    orgId,
    branchCode,
    docTypeCode,
  );
  const dSeg = Date.now().toString().slice(-9).padStart(9, '0');

  const clientRuc = parseRuc(input.client.ruc);
  const iTipoRec =
    input.client.type === 'juridico' ? '01' : '02';

  const gItem: FacturaElectronica['gItem'] = [];
  let dTotNeto = 0;
  let dTotITBMS = 0;
  let dVTotItemsSum = 0;

  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    const qty = it.quantity;
    const dPrUnit = Math.round(it.unitPrice * 100) / 100;
    const itbmsRate = it.itbmsRate ?? 0;
    const rate = itbmsRate >= 0.15 ? 0.15 : itbmsRate >= 0.1 ? 0.1 : itbmsRate >= 0.07 ? 0.07 : 0;
    const dPrItem = Math.round(dPrUnit * qty * 100) / 100;
    const dValITBMS = Math.round(dPrItem * rate * 100) / 100;
    const dValTotItem = Math.round((dPrItem + dValITBMS) * 100) / 100;

    dTotNeto += dPrItem;
    dTotITBMS += dValITBMS;
    dVTotItemsSum += dValTotItem;

    const dTasaITBMS =
      rate >= 0.15 ? '03' : rate >= 0.1 ? '02' : rate >= 0.07 ? '01' : '00';

    gItem.push({
      dSecItem: i + 1,
      dDescProd: it.description.slice(0, 500),
      dCantCodInt: qty,
      gPrecios: {
        dPrUnit,
        dPrItem,
        dValTotItem,
      },
      gITBMSItem: {
        dTasaITBMS,
        dValITBMS,
      },
    });
  }

  const dVTot = Math.round(dVTotItemsSum * 100) / 100;
  const dTotGravado = Math.round((dTotITBMS) * 100) / 100;

  const gTot = {
    dTotNeto: Math.round(dTotNeto * 100) / 100,
    dTotITBMS: Math.round(dTotITBMS * 100) / 100,
    dTotISC: 0,
    dTotGravado,
    dVTot,
    dTotRec: dVTot,
    iPzPag: '1',
    dNroItems: gItem.length,
    dVTotItems: Math.round(dVTotItemsSum * 100) / 100,
    gFormaPago: [{ iFormaPago: '02', dVlrCuota: dVTot }],
  };

  const gDatRec: FacturaElectronica['gDGen']['gDatRec'] = {
    iTipoRec,
    gRucRec: {
      dTipoRuc: clientRuc.dTipoRuc,
      dRuc: clientRuc.dRuc,
      dDV: clientRuc.dDV,
    },
    dNombRec: input.client.name.slice(0, 200),
    cPaisRec: 'PA',
    dPaisRecDesc: 'Panama',
  };

  return {
    dVerForm: '1.00',
    dId: '',
    gDGen: {
      iAmb: '2',
      iTpEmis: '01',
      iDoc: docTypeCode,
      dNroDF,
      dPtoFacDF: branchCode,
      dSeg,
      dFechaEm,
      iNatOp: '01',
      iTipoOp: '1',
      iDest: '1',
      iFormCAFE: '3',
      iEntCAFE: '3',
      dEnvFE: '1',
      iProGen: '1',
      gEmis: emitter,
      gDatRec,
    },
    gItem,
    gTot,
  };
}

Deno.serve(async (req: Request) => {
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
    const { userId } = await verifyAuth(req);
    const supabase = createServiceClient();
    const body = await req.json();

    // Obtener org_id del perfil del usuario (org_id es FK a organizations)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.org_id) {
      throw new ForbiddenError('Usuario no asociado a ninguna organización');
    }

    const organizationId = profile.org_id as string;

    // Determinar modo: XML, JSON DGI completo, o JSON simplificado
    let result: EmitResponse;
    if (body.xml) {
      result = await emitFromXml(body.xml, organizationId, supabase);
    } else if (body.document) {
      result = await emitFromJson(body.document, organizationId, supabase);
    } else if (body.docType) {
      const docToEmit = await translateToFEFormat(
        body as SimplifiedInput,
        organizationId,
        supabase,
      );
      result = await emitFromJson(docToEmit, organizationId, supabase);
    } else {
      throw new ValidationError('Se requiere "document", "docType" o "xml"');
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

  // 4. Construir XML (el elemento raíz rFE debe tener Id para la firma XAdES)
  const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>';
  const xmlBody = buildXml({
    rFE: {
      '@_xmlns': 'https://dgi.mef.gob.pa',
      '@_Id': doc.dId,
      ...doc,
    },
  });
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

  // Crear registro en la tabla documents (usar org_id)
  const record: Record<string, unknown> = {
    cufe,
    org_id: organizationId,
    doc_type: doc.gDGen.iDoc,
    doc_number: doc.gDGen.dNroDF,
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

  // Insertar líneas en document_lines para reportes "Por producto"
  const gItem = doc.gItem ?? [];
  if (gItem.length > 0) {
    const linesToInsert = gItem.map((item: {
      dSecItem?: number;
      dDescProd?: string;
      dCantCodInt?: number;
      gPrecios?: { dPrUnit?: number; dPrItem?: number; dValTotItem?: number };
      gITBMSItem?: { dTasaITBMS?: string; dValITBMS?: number };
    }) => {
      const precios = item.gPrecios ?? {};
      const itbms = item.gITBMSItem ?? {};
      const tasaCod = itbms.dTasaITBMS ?? '00';
      const itbmsRate = ITBMS_RATE_MAP[tasaCod] ?? 0;
      return {
        document_id: savedRecord.id,
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
      console.error('Error al insertar document_lines:', linesError.message);
      // No fallar la emisión: el documento ya se creó
    }
  }

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
