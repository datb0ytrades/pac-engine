import {
  generateCufe,
  generateCufeFromComponents,
  parseCufe,
  validateCufe,
  calculateLuhnDV,
  type CufeComponents,
} from '../../src/cufe/cufe-generator';
import type { FacturaElectronica } from '../../src/types';

// ============================================================================
// Helpers
// ============================================================================

/** Componentes válidos de prueba */
function sampleComponents(): CufeComponents {
  return {
    iDoc: '01',          // Factura operación interna
    dTipoRuc: '2',       // Jurídico
    dRuc: '155-1234567-2-00', // RUC (se padea a 20 chars con ceros)
    dDV: '31',            // Dígito verificador (se padea a 3 chars con guiones)
    dSucEm: '0001',       // Sucursal
    dFechaEm: '20250115', // Fecha de emisión YYYYMMDD
    dNroDF: '0000000001', // Número de documento fiscal
    dPtoFacDF: '001',     // Punto de facturación
    iTpEmis: '01',        // Tipo de emisión normal
    iAmb: '2',            // Ambiente pruebas
    dSeg: '123456789',    // Código de seguridad
  };
}

/** Documento de factura electrónica de prueba para generateCufe */
function sampleDocument(): Pick<FacturaElectronica, 'gDGen' | 'gItem' | 'gTot'> {
  return {
    gDGen: {
      iAmb: '2',
      iTpEmis: '01',
      iDoc: '01',
      dNroDF: '0000000001',
      dPtoFacDF: '001',
      dSeg: '123456789',
      dFechaEm: '2025-01-15T10:30:00-05:00',
      iNatOp: '01',
      iTipoOp: '1',
      iDest: '1',
      iFormCAFE: '1',
      iEntCAFE: '1',
      dEnvFE: '1',
      iProGen: '1',
      gEmis: {
        gRucEmi: {
          dTipoRuc: '2',
          dRuc: '155-1234567-2-00',
          dDV: '31',
        },
        dNombEm: 'Empresa de Prueba S.A.',
        dSucEm: '0001',
        dCoordEm: '+8.9833,-79.5167',
        dDirecEm: 'Calle 50, Ciudad de Panamá',
        gUbiEm: {
          dCodUbi: '08010101',
          dCorreg: 'Bella Vista',
          dDistr: 'Panamá',
          dProv: 'Panamá',
        },
      },
      gDatRec: {
        iTipoRec: '01',
        gRucRec: { dTipoRuc: '2', dRuc: '8-800-12345', dDV: '55' },
        dNombRec: 'Receptor S.A.',
        cPaisRec: 'PA',
      },
    },
    gItem: [],
    gTot: {} as any,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('CUFE Generator - Ficha Técnica DGI Panamá V1.00', () => {
  // =========================================================================
  // Cálculo del Dígito Verificador Luhn
  // =========================================================================
  describe('calculateLuhnDV', () => {
    it('calcula DV correcto para cadena de solo dígitos', () => {
      // Luhn mod-10 de "7992739871" = 3
      expect(calculateLuhnDV('7992739871')).toBe(3);
    });

    it('retorna 0 cuando la suma es múltiplo de 10', () => {
      // "0" → sum = 0, mod 10 = 0 → DV = 0
      expect(calculateLuhnDV('0')).toBe(0);
    });

    it('maneja letras convirtiendo al último dígito ASCII', () => {
      // 'A' = ASCII 65 → dígito 5
      // 'B' = ASCII 66 → dígito 6
      const dvWithLetters = calculateLuhnDV('A1B2');
      const dvWithDigits = calculateLuhnDV('5162');
      expect(dvWithLetters).toBe(dvWithDigits);
    });

    it('ignora guiones en el cálculo', () => {
      const dv1 = calculateLuhnDV('12-34');
      const dv2 = calculateLuhnDV('1234');
      expect(dv1).toBe(dv2);
    });

    it('DV siempre está entre 0 y 9', () => {
      for (let i = 0; i < 100; i++) {
        const input = String(Math.floor(Math.random() * 1000000));
        const dv = calculateLuhnDV(input);
        expect(dv).toBeGreaterThanOrEqual(0);
        expect(dv).toBeLessThanOrEqual(9);
      }
    });
  });

  // =========================================================================
  // Generación desde componentes
  // =========================================================================
  describe('generateCufeFromComponents', () => {
    it('genera un CUFE de 66 caracteres con prefijo "FE"', () => {
      const cufe = generateCufeFromComponents(sampleComponents());
      expect(cufe).toHaveLength(66);
      expect(cufe.startsWith('FE')).toBe(true);
    });

    it('el CUFE generado pasa la validación Luhn', () => {
      const cufe = generateCufeFromComponents(sampleComponents());
      expect(validateCufe(cufe)).toBe(true);
    });

    it('posiciona los campos correctamente según Tabla 14', () => {
      const comp = sampleComponents();
      const cufe = generateCufeFromComponents(comp);
      const body = cufe.substring(2); // quitar "FE"

      let pos = 0;
      expect(body.substring(pos, pos + 2)).toBe(comp.iDoc); pos += 2;
      expect(body.substring(pos, pos + 1)).toBe(comp.dTipoRuc); pos += 1;
      // RUC se padea con ceros a la izquierda hasta 20
      expect(body.substring(pos, pos + 20)).toBe(comp.dRuc.padStart(20, '0')); pos += 20;
      // DV se padea con guiones a la izquierda hasta 3
      expect(body.substring(pos, pos + 3)).toBe(comp.dDV.padStart(3, '-')); pos += 3;
      expect(body.substring(pos, pos + 4)).toBe(comp.dSucEm); pos += 4;
      expect(body.substring(pos, pos + 8)).toBe(comp.dFechaEm); pos += 8;
      expect(body.substring(pos, pos + 10)).toBe(comp.dNroDF); pos += 10;
      expect(body.substring(pos, pos + 3)).toBe(comp.dPtoFacDF); pos += 3;
      expect(body.substring(pos, pos + 2)).toBe(comp.iTpEmis); pos += 2;
      expect(body.substring(pos, pos + 1)).toBe(comp.iAmb); pos += 1;
      expect(body.substring(pos, pos + 9)).toBe(comp.dSeg);
    });

    it('padea el RUC con ceros a la izquierda', () => {
      const comp = sampleComponents();
      comp.dRuc = '12345';
      const cufe = generateCufeFromComponents(comp);
      const body = cufe.substring(2);
      const ruc = body.substring(3, 23); // pos 3 = después de iDoc(2) + dTipoRuc(1)
      expect(ruc).toBe('00000000000000012345');
    });

    it('padea el DV con guiones a la izquierda', () => {
      const comp = sampleComponents();
      comp.dDV = '5';
      const cufe = generateCufeFromComponents(comp);
      const body = cufe.substring(2);
      const dv = body.substring(23, 26); // pos 23 = después de iDoc(2)+dTipoRuc(1)+dRuc(20)
      expect(dv).toBe('--5');
    });

    it('genera CUFEs determinísticos (mismo input → mismo output)', () => {
      const comp = sampleComponents();
      const cufe1 = generateCufeFromComponents(comp);
      const cufe2 = generateCufeFromComponents(comp);
      expect(cufe1).toBe(cufe2);
    });

    it('genera CUFEs diferentes para documentos diferentes', () => {
      const comp1 = sampleComponents();
      const comp2 = { ...sampleComponents(), dNroDF: '0000000002' };
      const cufe1 = generateCufeFromComponents(comp1);
      const cufe2 = generateCufeFromComponents(comp2);
      expect(cufe1).not.toBe(cufe2);
    });

    it('genera CUFEs diferentes cuando cambia el tipo de documento', () => {
      const cufe1 = generateCufeFromComponents({ ...sampleComponents(), iDoc: '01' });
      const cufe2 = generateCufeFromComponents({ ...sampleComponents(), iDoc: '04' });
      expect(cufe1).not.toBe(cufe2);
    });

    it('genera CUFEs diferentes cuando cambia el ambiente', () => {
      const cufe1 = generateCufeFromComponents({ ...sampleComponents(), iAmb: '1' });
      const cufe2 = generateCufeFromComponents({ ...sampleComponents(), iAmb: '2' });
      expect(cufe1).not.toBe(cufe2);
    });

    it('genera CUFEs diferentes cuando cambia la fecha', () => {
      const cufe1 = generateCufeFromComponents({ ...sampleComponents(), dFechaEm: '20250115' });
      const cufe2 = generateCufeFromComponents({ ...sampleComponents(), dFechaEm: '20250116' });
      expect(cufe1).not.toBe(cufe2);
    });

    it('genera CUFEs diferentes cuando cambia el RUC', () => {
      const cufe1 = generateCufeFromComponents({ ...sampleComponents(), dRuc: '123' });
      const cufe2 = generateCufeFromComponents({ ...sampleComponents(), dRuc: '456' });
      expect(cufe1).not.toBe(cufe2);
    });

    it('lanza error si un campo excede la longitud máxima', () => {
      const comp = sampleComponents();
      comp.dRuc = '123456789012345678901'; // 21 chars, excede 20
      expect(() => generateCufeFromComponents(comp)).toThrow(/dRuc excede/);
    });

    it('lanza error si iDoc excede 2 caracteres', () => {
      const comp = sampleComponents();
      comp.iDoc = '012'; // 3 chars
      expect(() => generateCufeFromComponents(comp)).toThrow(/iDoc/);
    });
  });

  // =========================================================================
  // Generación desde documento (FacturaElectronica)
  // =========================================================================
  describe('generateCufe (desde documento)', () => {
    it('genera un CUFE válido desde un documento', () => {
      const doc = sampleDocument();
      const cufe = generateCufe(doc);

      expect(cufe).toHaveLength(66);
      expect(cufe.startsWith('FE')).toBe(true);
      expect(validateCufe(cufe)).toBe(true);
    });

    it('extrae la fecha correctamente del formato ISO', () => {
      const doc = sampleDocument();
      const cufe = generateCufe(doc);
      const parsed = parseCufe(cufe);

      expect(parsed.dFechaEm).toBe('20250115');
    });

    it('extrae el RUC correctamente', () => {
      const doc = sampleDocument();
      const cufe = generateCufe(doc);
      const parsed = parseCufe(cufe);

      // RUC "155-1234567-2-00" padeado a 20 chars
      expect(parsed.dRuc).toBe('0000155-1234567-2-00');
    });

    it('extrae los campos del emisor correctamente', () => {
      const doc = sampleDocument();
      const cufe = generateCufe(doc);
      const parsed = parseCufe(cufe);

      expect(parsed.iDoc).toBe('01');
      expect(parsed.dTipoRuc).toBe('2');
      expect(parsed.dSucEm).toBe('0001');
      expect(parsed.dNroDF).toBe('0000000001');
      expect(parsed.dPtoFacDF).toBe('001');
      expect(parsed.iTpEmis).toBe('01');
      expect(parsed.iAmb).toBe('2');
      expect(parsed.dSeg).toBe('123456789');
    });

    it('genera CUFEs consistentes con generateCufeFromComponents', () => {
      const doc = sampleDocument();
      const cufeFromDoc = generateCufe(doc);
      const cufeFromComp = generateCufeFromComponents({
        iDoc: '01',
        dTipoRuc: '2',
        dRuc: '155-1234567-2-00',
        dDV: '31',
        dSucEm: '0001',
        dFechaEm: '20250115',
        dNroDF: '0000000001',
        dPtoFacDF: '001',
        iTpEmis: '01',
        iAmb: '2',
        dSeg: '123456789',
      });
      expect(cufeFromDoc).toBe(cufeFromComp);
    });

    it('el mismo documento siempre genera el mismo CUFE', () => {
      const doc = sampleDocument();
      const cufe1 = generateCufe(doc);
      const cufe2 = generateCufe(doc);
      expect(cufe1).toBe(cufe2);
    });

    it('documentos diferentes generan CUFEs diferentes', () => {
      const doc1 = sampleDocument();
      const doc2 = sampleDocument();
      doc2.gDGen.dNroDF = '0000000002';
      const cufe1 = generateCufe(doc1);
      const cufe2 = generateCufe(doc2);
      expect(cufe1).not.toBe(cufe2);
    });
  });

  // =========================================================================
  // Parsing del CUFE
  // =========================================================================
  describe('parseCufe', () => {
    it('descompone un CUFE válido en sus componentes', () => {
      const comp = sampleComponents();
      const cufe = generateCufeFromComponents(comp);
      const parsed = parseCufe(cufe);

      expect(parsed.iDoc).toBe(comp.iDoc);
      expect(parsed.dTipoRuc).toBe(comp.dTipoRuc);
      expect(parsed.dRuc).toBe(comp.dRuc.padStart(20, '0'));
      expect(parsed.dDV).toBe(comp.dDV.padStart(3, '-'));
      expect(parsed.dSucEm).toBe(comp.dSucEm);
      expect(parsed.dFechaEm).toBe(comp.dFechaEm);
      expect(parsed.dNroDF).toBe(comp.dNroDF);
      expect(parsed.dPtoFacDF).toBe(comp.dPtoFacDF);
      expect(parsed.iTpEmis).toBe(comp.iTpEmis);
      expect(parsed.iAmb).toBe(comp.iAmb);
      expect(parsed.dSeg).toBe(comp.dSeg);
      expect(parsed.dv).toBeGreaterThanOrEqual(0);
      expect(parsed.dv).toBeLessThanOrEqual(9);
    });

    it('lanza error si no empieza con "FE"', () => {
      expect(() => parseCufe('XX' + 'A'.repeat(64))).toThrow(/debe.*comenzar con "FE"/);
    });

    it('lanza error si la longitud no es 66', () => {
      expect(() => parseCufe('FE123')).toThrow(/66 caracteres/);
    });

    it('round-trip: generar → parsear → regenerar produce el mismo CUFE', () => {
      const original = generateCufeFromComponents(sampleComponents());
      const parsed = parseCufe(original);
      const regenerated = generateCufeFromComponents({
        iDoc: parsed.iDoc,
        dTipoRuc: parsed.dTipoRuc,
        dRuc: parsed.dRuc,
        dDV: parsed.dDV,
        dSucEm: parsed.dSucEm,
        dFechaEm: parsed.dFechaEm,
        dNroDF: parsed.dNroDF,
        dPtoFacDF: parsed.dPtoFacDF,
        iTpEmis: parsed.iTpEmis,
        iAmb: parsed.iAmb,
        dSeg: parsed.dSeg,
      });
      expect(regenerated).toBe(original);
    });
  });

  // =========================================================================
  // Validación del CUFE
  // =========================================================================
  describe('validateCufe', () => {
    it('valida un CUFE correcto', () => {
      const cufe = generateCufeFromComponents(sampleComponents());
      expect(validateCufe(cufe)).toBe(true);
    });

    it('rechaza un CUFE con DV incorrecto', () => {
      const cufe = generateCufeFromComponents(sampleComponents());
      // Cambiar el último dígito
      const lastDigit = parseInt(cufe.charAt(65), 10);
      const wrongDV = (lastDigit + 1) % 10;
      const badCufe = cufe.substring(0, 65) + wrongDV.toString();
      expect(validateCufe(badCufe)).toBe(false);
    });

    it('rechaza un CUFE sin prefijo "FE"', () => {
      expect(validateCufe('XX' + '0'.repeat(64))).toBe(false);
    });

    it('rechaza un CUFE con longitud incorrecta', () => {
      expect(validateCufe('FE123')).toBe(false);
      expect(validateCufe('FE' + '0'.repeat(100))).toBe(false);
    });

    it('rechaza string vacío', () => {
      expect(validateCufe('')).toBe(false);
    });
  });

  // =========================================================================
  // Compatibilidad con el validador de documentos
  // =========================================================================
  describe('Compatibilidad con document-validator', () => {
    it('el CUFE generado tiene la estructura esperada por el validador', () => {
      const cufe = generateCufeFromComponents(sampleComponents());

      // El validador espera: "FE" + cuerpo(63) + DV(1) = 66 chars
      expect(cufe.length).toBe(66);
      expect(cufe.substring(0, 2)).toBe('FE');

      const body = cufe.substring(2);
      // Verificar que el DV es el último carácter
      const bodyWithoutDV = body.substring(0, 63);
      const dv = parseInt(body.charAt(63), 10);
      expect(calculateLuhnDV(bodyWithoutDV)).toBe(dv);
    });

    it('estructura conforme a Tabla 14: posiciones y longitudes', () => {
      const cufe = generateCufeFromComponents(sampleComponents());
      const body = cufe.substring(2, 65); // 63 chars del cuerpo

      // Verificar que las posiciones suman 63
      const lengths = [2, 1, 20, 3, 4, 8, 10, 3, 2, 1, 9];
      expect(lengths.reduce((a, b) => a + b, 0)).toBe(63);

      // El cuerpo tiene exactamente 63 caracteres
      expect(body.length).toBe(63);
    });
  });
});
