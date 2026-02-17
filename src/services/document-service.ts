// ============================================================================
// Servicio principal de documentos fiscales electrónicos
//
// Implementa el pipeline completo de emisión:
//   Emisor firma → PAC valida → PAC firma → CUFE → Storage → DB → DGI
//
// Según la Ficha Técnica de la FE para PAC V1.00 - Abril 2025
// ============================================================================

import { supabase } from '../config/supabase';
import { env } from '../config/env';
import { validateDocument } from '../validators/document-validator';
import { facturaElectronicaSchema } from '../validators';
import {
  signXml,
  verifyXmlSignature,
  pacSignDocument,
  loadP12,
  loadPemFiles,
  type P12Credentials,
} from '../signing/xml-signer';
import { generateCufe } from '../cufe/cufe-generator';
import { parseXml, buildXml } from '../utils';
import { sendDocument } from '../dgi';
import { storeSignedXml, retrieveSignedXml, storeCafePdf } from './storage-service';
import { generateCafePdf } from './pdf-service';
import { ValidationError, NotFoundError, ConflictError } from '../middleware/error-handler';
import type { FacturaElectronica } from '../types';
import type {
  DocumentRecord,
  DocumentDetailResponse,
  DocumentListResponse,
  DocumentListFilters,
  EmitResponse,
} from '../types/api';

// --- Credenciales del PAC (cacheadas a nivel de módulo) ---

let cachedPacCreds: P12Credentials | null = null;

function loadPacCredentials(): P12Credentials {
  if (cachedPacCreds) return cachedPacCreds;

  // Intentar P12 primero
  if (env.SIGNING_P12_PATH && env.SIGNING_P12_PASSWORD) {
    cachedPacCreds = loadP12(env.SIGNING_P12_PATH, env.SIGNING_P12_PASSWORD);
    return cachedPacCreds;
  }

  // Fallback a PEM
  if (env.SIGNING_CERT_PATH && env.SIGNING_KEY_PATH) {
    cachedPacCreds = loadPemFiles(env.SIGNING_CERT_PATH, env.SIGNING_KEY_PATH);
    return cachedPacCreds;
  }

  throw new Error(
    'No se encontraron credenciales de firma del PAC. ' +
    'Configure SIGNING_P12_PATH + SIGNING_P12_PASSWORD o SIGNING_CERT_PATH + SIGNING_KEY_PATH',
  );
}

// ============================================================================
// Pipeline de emisión: XML firmado por el emisor
// ============================================================================

/**
 * Pipeline completo para un XML ya firmado por el emisor.
 *
 * 1. Parse XML → FacturaElectronica
 * 2. Validar reglas de negocio (validateDocument)
 * 3. Verificar firma del emisor (verifyXmlSignature)
 * 4. PAC firma con su certificado (pacSignDocument)
 * 5. CUFE (ya presente en dId del documento)
 * 6. Almacenar XML firmado en Supabase Storage
 * 7. Crear registro en tabla documents
 * 8. Encolar envío a DGI (async)
 * 9. Retornar respuesta
 */
export async function emitFromXml(
  signedXml: string,
  organizationId: string,
): Promise<EmitResponse> {
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

  // 3. Verificar firma del emisor
  const emitterVerification = verifyXmlSignature(signedXml);
  if (!emitterVerification.isValid) {
    throw new ValidationError('Firma del emisor inválida', {
      errors: emitterVerification.errors,
    });
  }

  // 4. PAC firma con su certificado
  const pacCreds = loadPacCredentials();
  const pacResult = pacSignDocument(signedXml, pacCreds, {
    documentId: doc.dId,
  });
  const finalXml = pacResult.signedXml;

  // 5. CUFE ya presente en dId
  const cufe = doc.dId;

  // 6-7. Almacenar y crear registro
  return await storeAndRecord(
    organizationId,
    cufe,
    finalXml,
    doc,
    validation.warnings,
  );
}

// ============================================================================
// Pipeline de emisión: JSON (sin firma del emisor)
// ============================================================================

/**
 * Pipeline completo para un documento en formato JSON.
 * El PAC firma directamente (no hay firma del emisor).
 *
 * 1. Validar con Zod schema
 * 2. Validar reglas de negocio
 * 3. Generar CUFE y asignar a dId
 * 4. Construir XML
 * 5. PAC firma el XML
 * 6-9. Almacenar, registrar, encolar
 */
export async function emitFromJson(
  document: Partial<FacturaElectronica>,
  organizationId: string,
): Promise<EmitResponse> {
  // 1. Validar estructura con Zod (sin requerir dId ya que se generará)
  const doc = document as FacturaElectronica;

  // 2. Generar CUFE si no está presente
  if (!doc.dId || doc.dId.trim() === '') {
    const cufe = generateCufe(doc);
    doc.dId = cufe;
  }

  // Validar con Zod después de asignar dId
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

  // 5. PAC firma directamente
  const pacCreds = loadPacCredentials();
  const signResult = signXml(xml, pacCreds, {
    documentId: doc.dId,
  });

  // 6-9. Almacenar y crear registro
  return await storeAndRecord(
    organizationId,
    doc.dId,
    signResult.signedXml,
    doc,
    validation.warnings,
  );
}

// ============================================================================
// Consulta de documentos
// ============================================================================

/**
 * Obtiene un documento por ID con verificación de pertenencia a organización.
 */
export async function getDocumentById(
  documentId: string,
  organizationId: string,
): Promise<DocumentDetailResponse | null> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .eq('organization_id', organizationId)
    .single();

  if (error || !data) return null;
  return toDetailResponse(data as DocumentRecord);
}

/**
 * Lista documentos con filtros y paginación por cursor.
 * El cursor es el ID del último elemento visible (UUID).
 * Ordenados por created_at descendente (más recientes primero).
 */
export async function listDocuments(
  organizationId: string,
  filters: DocumentListFilters,
): Promise<DocumentListResponse> {
  const limit = filters.limit ?? 20;

  let query = supabase
    .from('documents')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit + 1); // +1 para saber si hay más

  // Filtros opcionales
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.docType) {
    query = query.eq('doc_type', filters.docType);
  }
  if (filters.emitterRuc) {
    query = query.eq('emitter_ruc', filters.emitterRuc);
  }
  if (filters.dateFrom) {
    query = query.gte('emission_date', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('emission_date', filters.dateTo);
  }

  // Cursor: buscar documentos creados antes del documento del cursor
  if (filters.cursor) {
    // Primero obtener el created_at del cursor
    const { data: cursorDoc } = await supabase
      .from('documents')
      .select('created_at')
      .eq('id', filters.cursor)
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

  return {
    data: visibleRecords.map(toDetailResponse),
    pagination: {
      cursor: nextCursor,
      hasMore,
      limit,
    },
  };
}

// ============================================================================
// Anulación de documentos
// ============================================================================

/**
 * Anula un documento. Solo se puede anular si está en estado 'accepted'.
 */
export async function cancelDocument(
  documentId: string,
  organizationId: string,
  reason: string,
): Promise<DocumentDetailResponse> {
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

  return toDetailResponse(updated as DocumentRecord);
}

// ============================================================================
// PDF CAFE
// ============================================================================

/**
 * Genera o recupera el PDF CAFE de un documento.
 * Si ya existe en storage, lo recupera. Si no, lo genera y almacena.
 */
export async function getDocumentPdf(
  documentId: string,
  organizationId: string,
): Promise<Buffer> {
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

  // Si ya tiene PDF, recuperarlo
  if (record.pdf_storage_path) {
    const { data: pdfData, error: dlError } = await supabase.storage
      .from('pdf-cafe')
      .download(record.pdf_storage_path);

    if (!dlError && pdfData) {
      const arrayBuffer = await pdfData.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    // Si falla la descarga, regenerar
  }

  // Generar PDF
  const pdfBuffer = await generateCafePdf(record);

  // Almacenar en storage
  const pdfPath = await storeCafePdf(organizationId, record.cufe, pdfBuffer);

  // Actualizar registro con la ruta del PDF
  await supabase
    .from('documents')
    .update({ pdf_storage_path: pdfPath })
    .eq('id', documentId);

  return pdfBuffer;
}

// ============================================================================
// Funciones internas
// ============================================================================

/**
 * Almacena el XML, crea el registro en DB, y encola el envío a DGI.
 * Compartida por emitFromXml y emitFromJson.
 */
async function storeAndRecord(
  organizationId: string,
  cufe: string,
  signedXml: string,
  doc: FacturaElectronica,
  warnings: Array<{ code: string; message: string; field: string; severity: string }>,
): Promise<EmitResponse> {
  // Almacenar XML en Supabase Storage
  const xmlPath = await storeSignedXml(organizationId, cufe, signedXml);

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
    validation_warnings: warnings as DocumentRecord['validation_warnings'],
    environment: env.DGI_ENVIRONMENT,
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

  // Encolar envío a DGI (async, no bloquea la respuesta)
  queueDgiSubmission(savedRecord.id, signedXml);

  return {
    cufe,
    status: 'signed',
    authorizationCode: null,
    warnings: warnings as EmitResponse['warnings'],
    documentId: savedRecord.id,
  };
}

/**
 * Encola el envío a la DGI de forma asíncrona.
 * En esta versión usa setTimeout para simular una cola.
 * En producción: reemplazar por Bull, pg-boss u otro sistema de colas.
 */
function queueDgiSubmission(documentId: string, signedXml: string): void {
  // Ejecutar en background sin bloquear la respuesta
  setTimeout(async () => {
    try {
      // Actualizar status a 'sent_to_dgi'
      await supabase
        .from('documents')
        .update({ status: 'sent_to_dgi' })
        .eq('id', documentId);

      // Enviar a la DGI
      const dgiResponse = await sendDocument(signedXml);

      // Actualizar con la respuesta de la DGI
      await supabase
        .from('documents')
        .update({
          status: dgiResponse.status === 'accepted' ? 'accepted' : 'rejected',
          authorization_code: dgiResponse.code,
          dgi_response: dgiResponse as unknown as Record<string, unknown>,
        })
        .eq('id', documentId);

      console.log(`[DGI] Documento ${documentId}: ${dgiResponse.status}`);
    } catch (err) {
      // El sendDocument actualmente lanza "Not implemented"
      // En producción, esto se manejaría con reintentos
      console.error(`[DGI] Error enviando ${documentId}:`, (err as Error).message);

      await supabase
        .from('documents')
        .update({
          status: 'error',
          dgi_response: { error: (err as Error).message } as Record<string, unknown>,
        })
        .eq('id', documentId);
    }
  }, 100); // Pequeño delay para no bloquear
}

/**
 * Convierte un DocumentRecord de la DB a DocumentDetailResponse para la API.
 */
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
