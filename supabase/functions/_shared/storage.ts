// ============================================================================
// Servicio de almacenamiento en Supabase Storage para Deno Edge Functions
// Adaptado de src/services/storage-service.ts (Buffer → Uint8Array)
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

const XML_BUCKET = 'xml-documents';
const PDF_BUCKET = 'pdf-cafe';

/**
 * Genera la ruta de almacenamiento: {orgId}/{YYYY}/{MM}/{cufe}.{ext}
 */
function buildPath(organizationId: string, cufe: string, ext: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${organizationId}/${year}/${month}/${cufe}.${ext}`;
}

/**
 * Almacena el XML firmado en el bucket 'xml-documents'.
 */
export async function storeSignedXml(
  supabase: SupabaseClient,
  organizationId: string,
  cufe: string,
  signedXml: string,
): Promise<string> {
  const path = buildPath(organizationId, cufe, 'xml');

  const { error } = await supabase.storage
    .from(XML_BUCKET)
    .upload(path, signedXml, {
      contentType: 'application/xml',
      upsert: false,
    });

  if (error) {
    throw new Error(`Error al almacenar XML: ${error.message}`);
  }

  return path;
}

/**
 * Recupera el XML firmado desde el bucket 'xml-documents'.
 */
export async function retrieveSignedXml(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(XML_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Error al recuperar XML: ${error?.message ?? 'datos vacíos'}`);
  }

  return await data.text();
}

/**
 * Almacena el PDF CAFE en el bucket 'pdf-cafe'.
 * Acepta Uint8Array (Deno) en lugar de Buffer (Node.js).
 */
export async function storeCafePdf(
  supabase: SupabaseClient,
  organizationId: string,
  cufe: string,
  pdfData: Uint8Array,
): Promise<string> {
  const path = buildPath(organizationId, cufe, 'pdf');

  const { error } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(path, pdfData, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (error) {
    throw new Error(`Error al almacenar PDF: ${error.message}`);
  }

  return path;
}

/**
 * Recupera el PDF CAFE desde el bucket 'pdf-cafe'.
 * Retorna Uint8Array (Deno) en lugar de Buffer (Node.js).
 */
export async function retrieveCafePdf(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<Uint8Array> {
  const { data, error } = await supabase.storage
    .from(PDF_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Error al recuperar PDF: ${error?.message ?? 'datos vacíos'}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
