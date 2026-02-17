// ============================================================================
// Tipos de la API REST del PAC
// ============================================================================

import type { ValidationIssue } from './index';

// --- Estado del documento ---

export type DocumentStatus =
  | 'received'
  | 'validated'
  | 'signed'
  | 'sent_to_dgi'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'error';

// --- Registro en Supabase (tabla documents) ---

export interface DocumentRecord {
  id: string;
  cufe: string;
  organization_id: string;
  doc_type: string;
  emitter_ruc: string;
  emitter_name: string;
  receiver_ruc: string | null;
  receiver_name: string | null;
  emission_date: string;
  total_amount: number;
  total_tax: number;
  currency: string;
  status: DocumentStatus;
  xml_storage_path: string | null;
  pdf_storage_path: string | null;
  authorization_code: string | null;
  dgi_response: Record<string, unknown> | null;
  validation_warnings: ValidationIssue[];
  environment: string;
  cancelled_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

// --- Respuestas de la API ---

export interface EmitResponse {
  cufe: string;
  status: DocumentStatus;
  authorizationCode: string | null;
  warnings: ValidationIssue[];
  documentId: string;
}

export interface DocumentDetailResponse {
  id: string;
  cufe: string;
  docType: string;
  emitterRuc: string;
  emitterName: string;
  receiverRuc: string | null;
  receiverName: string | null;
  emissionDate: string;
  totalAmount: number;
  totalTax: number;
  currency: string;
  status: DocumentStatus;
  authorizationCode: string | null;
  dgiResponse: Record<string, unknown> | null;
  validationWarnings: ValidationIssue[];
  environment: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentListResponse {
  data: DocumentDetailResponse[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

// --- Filtros para listado ---

export interface DocumentListFilters {
  status?: DocumentStatus;
  docType?: string;
  emitterRuc?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
}

// --- Request bodies ---

export interface EmitXmlRequest {
  xml: string;
}

export interface CancelRequest {
  reason: string;
}

// --- Error de la API ---

export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}
