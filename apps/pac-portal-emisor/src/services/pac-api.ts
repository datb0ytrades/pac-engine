import { supabase } from '../lib/supabase';
import type {
  DocumentDetailResponse,
  DocumentListResponse,
  DocumentListFilters,
  EmitResponse,
} from '@pac/shared-types';

export interface InvoiceData {
  document: Record<string, unknown>;
}

export async function emitInvoice(invoiceData: InvoiceData): Promise<EmitResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  const { data, error } = await supabase.functions.invoke<EmitResponse>(
    'emit-document',
    {
      body: invoiceData,
      headers: accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : undefined,
    }
  );

  if (error) throw new Error(`Error al emitir factura: ${error.message}`);
  if (!data) throw new Error('La Edge Function no devolvió datos');
  return data;
}

export async function getInvoices(
  filters?: DocumentListFilters
): Promise<DocumentListResponse> {
  let query = supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.docType) query = query.eq('doc_type', filters.docType);
  if (filters?.emitterRuc) query = query.eq('emitter_ruc', filters.emitterRuc);
  if (filters?.dateFrom) query = query.gte('emission_date', filters.dateFrom);
  if (filters?.dateTo) query = query.lte('emission_date', filters.dateTo);

  const limit = Math.min(filters?.limit ?? 20, 100);
  query = query.limit(limit + 1);

  const { data, error } = await query;
  if (error) throw new Error(`Error al listar facturas: ${error.message}`);

  const items = (data ?? []) as Array<Record<string, unknown>>;
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const lastId = page.length > 0 ? (page[page.length - 1].id as string) : null;

  const mapped: DocumentDetailResponse[] = page.map((row) => ({
    id: row.id as string,
    cufe: row.cufe as string,
    docType: row.doc_type as string,
    emitterRuc: row.emitter_ruc as string,
    emitterName: row.emitter_name as string,
    receiverRuc: row.receiver_ruc as string | null,
    receiverName: row.receiver_name as string | null,
    emissionDate: row.emission_date as string,
    totalAmount: Number(row.total_amount),
    totalTax: Number(row.total_tax),
    currency: row.currency as string,
    status: row.status as DocumentDetailResponse['status'],
    authorizationCode: row.authorization_code as string | null,
    dgiResponse: row.dgi_response as Record<string, unknown> | null,
    validationWarnings: (row.validation_warnings as DocumentDetailResponse['validationWarnings']) ?? [],
    environment: row.environment as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));

  return {
    data: mapped,
    pagination: { cursor: lastId, hasMore, limit },
  };
}

export async function cancelInvoice(
  id: string,
  reason: string
): Promise<DocumentDetailResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  const { data, error } = await supabase.functions.invoke<DocumentDetailResponse>(
    'cancel-document',
    {
      body: { documentId: id, reason },
      headers: accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : undefined,
    }
  );

  if (error) throw new Error(`Error al anular factura: ${error.message}`);
  if (!data) throw new Error('La Edge Function no devolvió datos');
  return data;
}

export async function downloadPDF(id: string): Promise<Blob> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const url = `${supabaseUrl}/functions/v1/generate-cafe-pdf?id=${encodeURIComponent(id)}`;

  const headers: Record<string, string> = {
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    const errText = await res.text();
    let errBody: { error?: string } = {};
    try { errBody = JSON.parse(errText); } catch { errBody = { error: `HTTP ${res.status}` }; }
    throw new Error(errBody.error ?? `Error al descargar PDF: ${res.status}`);
  }

  return await res.blob();
}
