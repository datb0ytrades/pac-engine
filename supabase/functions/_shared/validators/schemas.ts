// ============================================================================
// Schemas Zod para validación de entrada API
// Adaptado para Deno Edge Functions
// ============================================================================

import { z } from 'zod';

export const grupoRucSchema = z.object({
  dTipoRuc: z.enum(['1', '2']),
  dRuc: z.string().min(1, 'RUC es requerido').max(20),
  dDV: z.string().min(1).max(2, 'DV debe tener máximo 2 caracteres'),
});

export const grupoUbicacionSchema = z.object({
  dCodUbi: z.string().length(8),
  dCorreg: z.string().min(1).max(50),
  dDistr: z.string().min(1).max(50),
  dProv: z.string().min(1).max(50),
});

export const grupoEmisorSchema = z.object({
  gRucEmi: grupoRucSchema,
  dNombEm: z.string().min(2).max(200),
  dSucEm: z.string().length(4),
  dCoordEm: z.string().max(22),
  dDirecEm: z.string().min(1).max(100),
  gUbiEm: grupoUbicacionSchema,
  dTfnEm: z.array(z.string().min(7).max(16)).min(1).max(3).optional(),
  dCorElectEmi: z.array(z.string().email().max(50)).max(3).optional(),
});

export const grupoReceptorSchema = z.object({
  iTipoRec: z.enum(['01', '02', '03', '04']),
  gRucRec: grupoRucSchema.optional(),
  dNombRec: z.string().min(2).max(200).optional(),
  dDirecRec: z.string().max(100).optional(),
  gUbiRec: grupoUbicacionSchema.optional(),
  gIdExt: z
    .object({
      dIdExt: z.string().min(1).max(50),
      dPaisExt: z.string().min(2).max(100).optional(),
    })
    .optional(),
  dTfnRec: z.array(z.string().min(7).max(16)).max(3).optional(),
  dCorElectRec: z.array(z.string().email().max(100)).max(3).optional(),
  cPaisRec: z.string().length(2),
  dPaisRecDesc: z.string().min(5).max(50).optional(),
});

export const grupoPreciosSchema = z.object({
  dPrUnit: z.number().nonnegative(),
  dPrUnitDesc: z.number().nonnegative().optional(),
  dPrItem: z.number().nonnegative(),
  dPrAcarItem: z.number().nonnegative().optional(),
  dPrSegItem: z.number().nonnegative().optional(),
  dValTotItem: z.number().nonnegative(),
});

export const grupoITBMSSchema = z.object({
  dTasaITBMS: z.enum(['00', '01', '02', '03']),
  dValITBMS: z.number().nonnegative(),
});

export const itemDocumentoSchema = z.object({
  dSecItem: z.number().int().positive(),
  dDescProd: z.string().min(2).max(500),
  dCodProd: z.string().max(20).optional(),
  cUnidad: z.string().max(20).optional(),
  dCantCodInt: z.number().positive(),
  dFechaFab: z.string().optional(),
  dFechaCad: z.string().optional(),
  dCodCPBSabr: z.string().length(2).optional(),
  dCodCPBScmp: z.string().length(4).optional(),
  cUnidadCPBS: z.string().max(30).optional(),
  dInfEmFE: z.string().max(5000).optional(),
  gPrecios: grupoPreciosSchema,
  gITBMSItem: grupoITBMSSchema,
  gISCItem: z
    .object({
      dTasaISC: z.number().nonnegative().optional(),
      dValISC: z.number().nonnegative(),
    })
    .optional(),
  gOTIItem: z
    .array(
      z.object({
        dCodOTI: z.enum(['01', '02', '03', '04', '05', '06', '07', '08', '09']),
        dValOTI: z.number().nonnegative(),
      }),
    )
    .optional(),
});

export const grupoFormaPagoSchema = z.object({
  iFormaPago: z.enum([
    '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '99',
  ]),
  dFormaPagoDesc: z.string().min(10).max(100).optional(),
  dVlrCuota: z.number().nonnegative(),
});

export const grupoTotalesSchema = z.object({
  dTotNeto: z.number().nonnegative(),
  dTotITBMS: z.number().nonnegative(),
  dTotISC: z.number().nonnegative().optional(),
  dTotGravado: z.number().nonnegative(),
  dTotDesc: z.number().nonnegative().optional(),
  dTotAcar: z.number().nonnegative().optional(),
  dTotSeg: z.number().nonnegative().optional(),
  dVTot: z.number().nonnegative(),
  dTotRec: z.number().nonnegative(),
  dVuelto: z.number().nonnegative().optional(),
  iPzPag: z.enum(['1', '2', '3']),
  dNroItems: z.number().int().positive(),
  dVTotItems: z.number().nonnegative(),
  dTotOtrosGastos: z.number().nonnegative().optional(),
  gFormaPago: z.array(grupoFormaPagoSchema).min(1).max(10),
  gRetenc: z
    .object({
      cCodRetenc: z.enum(['1', '2', '3', '4', '7', '8']),
      cValRetenc: z.number().nonnegative(),
    })
    .optional(),
  gPagPlazo: z
    .array(
      z.object({
        dSecItem: z.number().int().positive(),
        dFecItPlazo: z.string(),
        dValItPlazo: z.number().nonnegative(),
        dInfPagPlazo: z.string().max(1000).optional(),
      }),
    )
    .optional(),
  gOTITotal: z
    .array(
      z.object({
        dCodOTITotal: z.enum(['01', '02', '03', '04', '05', '06', '07', '08', '09']),
        dValOTITotal: z.number().nonnegative(),
      }),
    )
    .optional(),
});

export const facturaElectronicaSchema = z.object({
  dVerForm: z.literal('1.00'),
  dId: z.string().length(66),
  gDGen: z.object({
    iAmb: z.enum(['1', '2']),
    iTpEmis: z.enum(['01', '02', '03', '04']),
    dFechaCont: z.string().optional(),
    dMotCont: z.string().min(15).max(250).optional(),
    iDoc: z.enum(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']),
    dNroDF: z.string().length(10),
    dPtoFacDF: z.string().length(3),
    dSeg: z.string().length(9),
    dFechaEm: z.string(),
    dFechaSalida: z.string().optional(),
    iNatOp: z.enum([
      '01', '02', '03', '04', '05', '10', '11', '12', '13', '14', '20', '21',
    ]),
    iTipoOp: z.enum(['1', '2']),
    iDest: z.enum(['1', '2']),
    iFormCAFE: z.enum(['1', '2', '3']),
    iEntCAFE: z.enum(['1', '2', '3']),
    dEnvFE: z.enum(['1', '2']),
    iProGen: z.enum(['1', '2', '3', '4']),
    iTipoTranVenta: z.enum(['1', '2', '3', '4']).optional(),
    iTipoSuc: z.enum(['1', '2']).optional(),
    dInfEmFE: z.string().max(5000).optional(),
    gEmis: grupoEmisorSchema,
    gDatRec: grupoReceptorSchema,
    gFExp: z
      .object({
        cCondEntr: z.string().length(3),
        cMoneda: z.string().length(3).optional(),
        cMonedaDesc: z.string().min(5).max(50).optional(),
        dCambio: z.number().positive().optional(),
        dVTotEst: z.number().nonnegative().optional(),
        dPuertoEmbarq: z.string().min(5).max(50).optional(),
      })
      .optional(),
    gDFRef: z
      .array(
        z.object({
          gRucEmDFRef: grupoRucSchema,
          dNombEmRef: z.string().min(2).max(200),
          dFechaDFRef: z.string(),
          gDFRefFE: z.object({ dCUFERef: z.string().length(66) }).optional(),
          gDFRefFacPap: z.object({ dNroFacPap: z.string().max(22) }).optional(),
          gDFRefFacIE: z.object({ dNroFacIE: z.string().max(22) }).optional(),
        }),
      )
      .max(99)
      .optional(),
    gAutXML: z
      .array(z.object({ gRucAutXML: grupoRucSchema }))
      .max(10)
      .optional(),
  }),
  gItem: z.array(itemDocumentoSchema).min(1).max(1000),
  gTot: grupoTotalesSchema,
});

// Re-exports
export { validateDocument, calculateCufeLuhn } from './document-validator.ts';
export type { ValidationRule } from './validation-codes.ts';
