// Generación de CUFE (Código Único de Factura Electrónica)
// Según Ficha Técnica de la FE para PAC V1.00 - Abril 2025, Tabla 14

// Re-exportar todo del módulo principal
export {
  generateCufe,
  generateCufeFromComponents,
  parseCufe,
  validateCufe,
  calculateLuhnDV,
} from './cufe-generator';
export type { CufeComponents } from './cufe-generator';

// Legacy: mantener la interfaz simple para el test existente
import crypto from 'crypto';

export interface CufeInput {
  documentNumber: string;
  emissionDate: string;
  emitterRuc: string;
  totalAmount: number;
  taxAmount: number;
}

/**
 * @deprecated Usar generateCufe(doc) de cufe-generator en su lugar.
 * Esta función genera un hash SHA-384 simple, NO el CUFE oficial de la DGI.
 */
export function generateCufeHash(input: CufeInput): string {
  const seed = [
    input.documentNumber,
    input.emissionDate,
    input.emitterRuc,
    input.totalAmount.toFixed(2),
    input.taxAmount.toFixed(2),
  ].join('');

  return crypto.createHash('sha384').update(seed).digest('hex');
}
