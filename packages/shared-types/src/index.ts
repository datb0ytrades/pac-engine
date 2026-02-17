// ============================================================================
// Tipos compartidos entre backend PAC y apps (emisor, consumidor)
// ============================================================================

export type DocumentStatus =
  | 'received'
  | 'validated'
  | 'signed'
  | 'sent_to_dgi'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'error';

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
  validationWarnings: Array<{ code: string; message: string; field?: string; severity?: string }>;
  environment: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentListFilters {
  status?: DocumentStatus;
  docType?: string;
  emitterRuc?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
}

export interface DocumentListResponse {
  data: DocumentDetailResponse[];
  pagination: { cursor: string | null; hasMore: boolean; limit: number };
}

export interface EmitResponse {
  cufe: string;
  status: DocumentStatus;
  authorizationCode: string | null;
  warnings: Array<{ code: string; message: string; field?: string; severity?: string }>;
  documentId: string;
}

// FacturaElectronica (simplificado para emisor)
export interface InvoiceData {
  document: Record<string, unknown>;
}

// received_documents / expenses
export interface ReceivedDocument {
  id: string;
  user_id: string;
  merchant_name: string;
  amount: number;
  description: string | null;
  category: string | null;
  is_deductible: boolean;
  image_storage_path: string | null;
  receipt_date: string;
  created_at: string;
  updated_at: string;
}

export interface SaveReceiptData {
  merchant_name: string;
  amount: number;
  description?: string;
  category?: string;
  is_deductible?: boolean;
  receipt_date?: string;
}

export interface CategorizeExpenseResponse {
  category: string;
  confidence: number;
  is_deductible: boolean;
  reason: string;
}

export interface FinancialProfile {
  taxRegime?: string;
  businessType?: string;
  deductibleCategories?: string[];
}
