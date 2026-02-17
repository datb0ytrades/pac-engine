// ============================================================================
// API client para invocar las Edge Functions de Supabase
// ============================================================================

import { supabase } from '../config/supabase';
import { env } from '../config/env';
import type {
  EmitResponse,
  DocumentDetailResponse,
  DocumentListResponse,
  DocumentListFilters,
} from '../types/api';
import type { FacturaElectronica } from '../types';

/** Opciones para las llamadas a Edge Functions (ej: token JWT del usuario) */
export interface EdgeFunctionOptions {
  /** Token JWT del usuario autenticado. Requerido para Edge Functions que usan verifyAuth. */
  accessToken?: string;
}

/** Resultado de emitDocument */
export interface EmitDocumentResult {
  cufe: string;
  status: string;
  errors?: string[];
  /** Incluye los campos completos de EmitResponse */
  authorizationCode?: string | null;
  documentId?: string;
  warnings?: Array<{ code: string; message: string; severity?: string }>;
}

/** Error de la API con estructura conocida */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Emite un documento fiscal electrónico llamando a la edge function 'emit-document'.
 * Acepta factura en JSON (modo por defecto) o XML.
 *
 * @param data - Objeto con document (FacturaElectronica) o xml según el modo
 * @param options - Token JWT opcional para autenticación
 * @returns { cufe, status, errors, ... }
 */
export async function emitDocument(
  data:
    | { mode?: 'json'; document: FacturaElectronica }
    | { mode: 'xml'; xml: string },
  options?: EdgeFunctionOptions
): Promise<EmitDocumentResult> {
  try {
    const body =
      data.mode === 'xml'
        ? { mode: 'xml', xml: data.xml }
        : { document: data.document };

    const { data: result, error } = await supabase.functions.invoke<
      EmitResponse & { errors?: string[] }
    >('emit-document', {
      body,
      headers: options?.accessToken
        ? { Authorization: `Bearer ${options.accessToken}` }
        : undefined,
    });

    if (error) {
      const errMsg =
        error instanceof Error ? error.message : String(error);
      throw new ApiError(
        `Error al emitir documento: ${errMsg}`,
        'EMIT_ERROR',
        error
      );
    }

    if (!result) {
      throw new ApiError('La Edge Function no devolvió datos', 'EMPTY_RESPONSE');
    }

    return {
      cufe: result.cufe,
      status: result.status,
      errors: (result as { errors?: string[] }).errors,
      authorizationCode: result.authorizationCode,
      documentId: result.documentId,
      warnings: result.warnings,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiError(`Error al emitir documento: ${message}`, 'EMIT_ERROR', err);
  }
}

/**
 * Obtiene un documento por ID llamando a la edge function 'get-document'.
 *
 * @param id - UUID del documento
 * @param options - Token JWT opcional para autenticación
 * @returns Documento o undefined si no existe
 */
export async function getDocument(
  id: string,
  options?: EdgeFunctionOptions
): Promise<DocumentDetailResponse | null> {
  try {
    const url = new URL(
      `${env.SUPABASE_URL}/functions/v1/get-document?id=${encodeURIComponent(id)}`
    );
    const headers: Record<string, string> = {
      apikey: env.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    };
    if (options?.accessToken) {
      headers.Authorization = `Bearer ${options.accessToken}`;
    } else {
      headers.Authorization = `Bearer ${env.SUPABASE_SERVICE_KEY}`;
    }

    const res = await fetch(url.toString(), { method: 'GET', headers });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new ApiError(
        (errBody as { error?: string }).error ?? `HTTP ${res.status}`,
        (errBody as { code?: string }).code ?? 'GET_DOCUMENT_ERROR',
        errBody
      );
    }

    const data = (await res.json()) as DocumentDetailResponse;
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiError(
      `Error al obtener documento: ${message}`,
      'GET_DOCUMENT_ERROR',
      err
    );
  }
}

/**
 * Lista documentos con filtros y paginación.
 *
 * @param filters - status, docType, emitterRuc, dateFrom, dateTo, cursor, limit
 * @param options - Token JWT opcional
 */
export async function listDocuments(
  filters?: DocumentListFilters,
  options?: EdgeFunctionOptions
): Promise<DocumentListResponse> {
  try {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.docType) params.set('docType', filters.docType);
    if (filters?.emitterRuc) params.set('emitterRuc', filters.emitterRuc);
    if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.set('dateTo', filters.dateTo);
    if (filters?.cursor) params.set('cursor', filters.cursor);
    if (filters?.limit != null) params.set('limit', String(filters.limit));

    const url = new URL(
      `${env.SUPABASE_URL}/functions/v1/get-document?${params.toString()}`
    );
    const headers: Record<string, string> = {
      apikey: env.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    };
    if (options?.accessToken) {
      headers.Authorization = `Bearer ${options.accessToken}`;
    } else {
      headers.Authorization = `Bearer ${env.SUPABASE_SERVICE_KEY}`;
    }

    const res = await fetch(url.toString(), { method: 'GET', headers });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new ApiError(
        (errBody as { error?: string }).error ?? `HTTP ${res.status}`,
        (errBody as { code?: string }).code ?? 'LIST_DOCUMENTS_ERROR',
        errBody
      );
    }

    return (await res.json()) as DocumentListResponse;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiError(
      `Error al listar documentos: ${message}`,
      'LIST_DOCUMENTS_ERROR',
      err
    );
  }
}

/**
 * Anula un documento fiscal llamando a la edge function 'cancel-document'.
 *
 * @param id - UUID del documento
 * @param reason - Motivo de anulación (mín. 10 caracteres, máx. 500)
 * @param options - Token JWT opcional
 * @returns Documento actualizado con status 'cancelled'
 */
export async function cancelDocument(
  id: string,
  reason: string,
  options?: EdgeFunctionOptions
): Promise<DocumentDetailResponse> {
  try {
    const { data, error } = await supabase.functions.invoke<DocumentDetailResponse>(
      'cancel-document',
      {
        body: { documentId: id, reason },
        headers: options?.accessToken
          ? { Authorization: `Bearer ${options.accessToken}` }
          : undefined,
      }
    );

    if (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new ApiError(
        `Error al anular documento: ${errMsg}`,
        'CANCEL_ERROR',
        error
      );
    }

    if (!data) {
      throw new ApiError(
        'La Edge Function no devolvió datos',
        'EMPTY_RESPONSE'
      );
    }

    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiError(
      `Error al anular documento: ${message}`,
      'CANCEL_ERROR',
      err
    );
  }
}

/**
 * Genera o recupera el PDF CAFE de un documento llamando a la edge function 'generate-cafe-pdf'.
 *
 * @param id - UUID del documento
 * @param options - Token JWT opcional
 * @returns Blob del PDF
 */
export async function generatePDF(
  id: string,
  options?: EdgeFunctionOptions
): Promise<Blob> {
  try {
    const url = new URL(
      `${env.SUPABASE_URL}/functions/v1/generate-cafe-pdf?id=${encodeURIComponent(id)}`
    );
    const headers: Record<string, string> = {
      apikey: env.SUPABASE_ANON_KEY,
    };
    if (options?.accessToken) {
      headers.Authorization = `Bearer ${options.accessToken}`;
    } else {
      headers.Authorization = `Bearer ${env.SUPABASE_SERVICE_KEY}`;
    }

    const res = await fetch(url.toString(), { method: 'GET', headers });

    if (!res.ok) {
      const errText = await res.text();
      let errBody: { error?: string; code?: string } = {};
      try {
        errBody = JSON.parse(errText);
      } catch {
        errBody = { error: errText || `HTTP ${res.status}` };
      }
      throw new ApiError(
        errBody.error ?? `HTTP ${res.status}`,
        errBody.code ?? 'PDF_ERROR',
        errBody
      );
    }

    return await res.blob();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiError(
      `Error al generar PDF: ${message}`,
      'PDF_ERROR',
      err
    );
  }
}
