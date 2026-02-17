// Integración con los web services de la DGI (Dirección General de Ingresos)
// TODO: Implementar llamadas SOAP/REST según documentación DGI

import { env } from '../config/env';
import type { DgiResponse } from '../types';

export async function sendDocument(_signedXml: string): Promise<DgiResponse> {
  const _baseUrl = env.DGI_WS_URL;
  throw new Error('Not implemented: sendDocument');
}

export async function queryDocumentStatus(_cufe: string): Promise<DgiResponse> {
  throw new Error('Not implemented: queryDocumentStatus');
}
