import type { FacturaElectronica } from '../../src/types';
import { calculateCufeLuhn } from '../../src/validators/document-validator';

/**
 * Genera un CUFE válido para testing basado en los datos del documento.
 * Estructura: iDoc(2) + dTipoRuc(1) + dRuc(20) + dDV(3) + dSucEm(4)
 *           + dFechaEm(8) + dNroDF(10) + dPtoFacDF(3) + iTpEmis(2)
 *           + iAmb(1) + dSeg(9) + DV(1) = 64 chars
 */
export function buildCufe(parts: {
  iDoc: string;
  dTipoRuc: string;
  dRuc: string;
  dDV: string;
  dSucEm: string;
  dFechaEm: string; // ISO format
  dNroDF: string;
  dPtoFacDF: string;
  iTpEmis: string;
  iAmb: string;
  dSeg: string;
}): string {
  const rucPadded = parts.dRuc.padStart(20, '0');
  // DV en CUFE: 3 posiciones, guión antes del dígito
  const dvPadded = `-${parts.dDV}`.padStart(3, '-');
  const fecha = parts.dFechaEm.substring(0, 10).replace(/-/g, '');

  const cufeWithoutDV =
    parts.iDoc +
    parts.dTipoRuc +
    rucPadded +
    dvPadded +
    parts.dSucEm +
    fecha +
    parts.dNroDF +
    parts.dPtoFacDF +
    parts.iTpEmis +
    parts.iAmb +
    parts.dSeg;

  const dv = calculateCufeLuhn(cufeWithoutDV);
  return cufeWithoutDV + dv.toString();
}

/**
 * Crea un documento de factura válido completo para usar como base en tests.
 * Todos los cálculos son correctos y consistentes.
 */
export function createValidDocument(): FacturaElectronica {
  const now = new Date();
  const fechaEm = now.toISOString();

  const cufe = buildCufe({
    iDoc: '01',
    dTipoRuc: '2',
    dRuc: '155-1234567-2-00',
    dDV: '23',
    dSucEm: '0001',
    dFechaEm: fechaEm,
    dNroDF: '0000000001',
    dPtoFacDF: '001',
    iTpEmis: '01',
    iAmb: '2',
    dSeg: '123456789',
  });

  // Item: 2 unidades a B/.100.00 c/u = B/.200.00, ITBMS 7% = B/.14.00
  const prItem = 200.0;
  const itbms = 14.0; // 200 * 0.07
  const valTotItem = prItem + itbms; // 214.00

  return {
    dVerForm: '1.00',
    dId: `FE${cufe}`,
    gDGen: {
      iAmb: '2',
      iTpEmis: '01',
      iDoc: '01',
      dNroDF: '0000000001',
      dPtoFacDF: '001',
      dSeg: '123456789',
      dFechaEm: fechaEm,
      iNatOp: '01',
      iTipoOp: '1',
      iDest: '1',
      iFormCAFE: '3',
      iEntCAFE: '2',
      dEnvFE: '1',
      iProGen: '1',
      iTipoTranVenta: '1',
      gEmis: {
        gRucEmi: { dTipoRuc: '2', dRuc: '155-1234567-2-00', dDV: '23' },
        dNombEm: 'Empresa de Prueba, S.A.',
        dSucEm: '0001',
        dCoordEm: '9.0000,-79.5000',
        dDirecEm: 'Calle 50, Ciudad de Panamá',
        gUbiEm: {
          dCodUbi: '08-01-01',
          dCorreg: 'Bella Vista',
          dDistr: 'Panamá',
          dProv: 'Panamá',
        },
      },
      gDatRec: {
        iTipoRec: '02', // Consumidor final
        dNombRec: 'Juan Pérez',
        cPaisRec: 'PA',
      },
    },
    gItem: [
      {
        dSecItem: 1,
        dDescProd: 'Servicio de consultoría',
        dCantCodInt: 2,
        gPrecios: {
          dPrUnit: 100.0,
          dPrItem: prItem,
          dValTotItem: valTotItem,
        },
        gITBMSItem: {
          dTasaITBMS: '01', // 7%
          dValITBMS: itbms,
        },
      },
    ],
    gTot: {
      dTotNeto: prItem, // 200.00
      dTotITBMS: itbms, // 14.00
      dTotGravado: itbms, // 14.00 (solo ITBMS, sin ISC ni OTI)
      dVTot: valTotItem, // 214.00 = dVTotItems + 0 + 0 + 0 - 0
      dTotRec: valTotItem, // 214.00
      iPzPag: '1',
      dNroItems: 1,
      dVTotItems: valTotItem, // 214.00
      gFormaPago: [
        {
          iFormaPago: '02', // Efectivo
          dVlrCuota: valTotItem, // 214.00
        },
      ],
    },
  };
}

/**
 * Helper para clonar profundamente un documento y aplicar modificaciones.
 */
export function modifyDoc(
  base: FacturaElectronica,
  modifier: (doc: FacturaElectronica) => void,
): FacturaElectronica {
  const clone = JSON.parse(JSON.stringify(base)) as FacturaElectronica;
  modifier(clone);
  return clone;
}
