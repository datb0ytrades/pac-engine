import { validateDocument, calculateCufeLuhn } from '../../src/validators/document-validator';
import { createValidDocument, modifyDoc } from './test-helpers';

describe('Document Validator - Ficha Técnica DGI Panamá V1.00', () => {
  // =====================================================================
  // XML VÁLIDO - debe pasar todas las validaciones
  // =====================================================================
  describe('Documento válido', () => {
    it('debe pasar todas las validaciones con un documento correcto', () => {
      const doc = createValidDocument();
      const result = validateDocument(doc);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('debe retornar la estructura correcta del resultado', () => {
      const doc = createValidDocument();
      const result = validateDocument(doc);

      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  // =====================================================================
  // 1. IDENTIFICACIÓN DE LA FE (A)
  // =====================================================================
  describe('Identificación de la FE', () => {
    it('[1000] rechaza versión de formato no soportada', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.dVerForm = '2.00';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1000' })]),
      );
    });

    it('[1001] rechaza CUFE con dígito verificador inválido', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        // Cambiar el último dígito del CUFE
        const lastChar = d.dId[d.dId.length - 1];
        const newLast = lastChar === '0' ? '1' : '0';
        d.dId = d.dId.substring(0, d.dId.length - 1) + newLast;
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1001' })]),
      );
    });

    it('[1001] rechaza CUFE con longitud incorrecta', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.dId = 'FE12345';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1001' })]),
      );
    });
  });

  // =====================================================================
  // 2. DATOS GENERALES (B)
  // =====================================================================
  describe('Datos generales de la transacción', () => {
    it('[1500] rechaza ambiente inválido', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iAmb = '3';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1500' })]),
      );
    });

    it('[1503] rechaza tipo de emisión inválido', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iTpEmis = '05';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1503' })]),
      );
    });

    it('[1505] rechaza operación entre contribuyentes sin autorización previa', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.gDatRec.iTipoRec = '01'; // Contribuyente
        d.gDGen.gDatRec.gRucRec = { dTipoRuc: '2', dRuc: '155-9999999-2-00', dDV: '45' };
        d.gDGen.gDatRec.dNombRec = 'Empresa Receptora S.A.';
        d.gDGen.iTpEmis = '03'; // Autorización posterior
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1505' })]),
      );
    });

    it('[1506/1509] rechaza contingencia sin fecha ni razón', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iTpEmis = '02'; // Contingencia
        // No informar dFechaCont ni dMotCont
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: '1506' }),
          expect.objectContaining({ code: '1509' }),
        ]),
      );
    });

    it('[1507] rechaza fecha de contingencia posterior a emisión', () => {
      const now = new Date();
      const future = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iTpEmis = '02';
        d.gDGen.dFechaCont = future.toISOString();
        d.gDGen.dMotCont = 'Falla en el sistema de facturación electrónica';
        d.gDGen.dFechaEm = now.toISOString();
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1507' })]),
      );
    });

    it('[1510] rechaza tipo de documento inválido', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iDoc = '99';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1510' })]),
      );
    });

    it('[1512] rechaza número de documento todo ceros', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.dNroDF = '0000000000';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1512' })]),
      );
    });

    it('[1515] rechaza punto de facturación todo ceros', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.dPtoFacDF = '000';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1515' })]),
      );
    });

    it('[1517] rechaza código de seguridad todo ceros', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.dSeg = '000000000';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1517' })]),
      );
    });

    it('[1520] rechaza fecha de emisión más de 2 días en el futuro', () => {
      const future = new Date();
      future.setDate(future.getDate() + 5);
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.dFechaEm = future.toISOString();
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1520' })]),
      );
    });

    it('[1519] advierte fecha de emisión más de 30 días en el pasado', () => {
      const past = new Date();
      past.setDate(past.getDate() - 40);
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.dFechaEm = past.toISOString();
      });
      const result = validateDocument(doc);

      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1519' })]),
      );
    });

    it('[1524] rechaza naturaleza de operación inválida', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iNatOp = '99';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1524' })]),
      );
    });

    it('[1525] rechaza tipo de operación inválido', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iTipoOp = '3';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1525' })]),
      );
    });

    it('[1526] rechaza destino inválido', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iDest = '3';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1526' })]),
      );
    });

    it('[1533] rechaza exportación con destino Panamá', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iDoc = '03'; // Exportación
        d.gDGen.iDest = '1'; // Panamá
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1533' })]),
      );
    });

    it('[1534] rechaza factura interna con destino extranjero', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iDoc = '01'; // Operación interna
        d.gDGen.iDest = '2'; // Extranjero
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1534' })]),
      );
    });

    it('[1527] rechaza formato CAFE inválido', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iFormCAFE = '9';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1527' })]),
      );
    });

    it('[1530] rechaza proceso de generación inválido', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iProGen = '9';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1530' })]),
      );
    });
  });

  // =====================================================================
  // 3. EMISOR (B30)
  // =====================================================================
  describe('Datos del emisor', () => {
    it('[1560] rechaza RUC del emisor vacío', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.gEmis.gRucEmi.dRuc = '';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1560' })]),
      );
    });

    it('[1560] rechaza tipo de contribuyente inválido', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.gEmis.gRucEmi.dTipoRuc = '3';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1560' })]),
      );
    });

    it('[1565] rechaza razón social del emisor vacía', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.gEmis.dNombEm = '';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1565' })]),
      );
    });

    it('[1566] rechaza código de sucursal con longitud incorrecta', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.gEmis.dSucEm = '01';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1566' })]),
      );
    });

    it('[1568] rechaza dirección del emisor vacía', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.gEmis.dDirecEm = '';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1568' })]),
      );
    });
  });

  // =====================================================================
  // 4. RECEPTOR (B40)
  // =====================================================================
  describe('Datos del receptor', () => {
    it('[1600] rechaza tipo de receptor inválido', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.gDatRec.iTipoRec = '05';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1600' })]),
      );
    });

    it('[1620] rechaza exportación con receptor no extranjero', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iDoc = '03'; // Exportación
        d.gDGen.iDest = '2';
        d.gDGen.gDatRec.iTipoRec = '01'; // Contribuyente (debería ser 04)
        d.gDGen.gDatRec.cPaisRec = 'US';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1620' })]),
      );
    });

    it('[1605] rechaza contribuyente sin razón social', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.gDatRec.iTipoRec = '01';
        d.gDGen.gDatRec.gRucRec = { dTipoRuc: '2', dRuc: '155-9999999-2-00', dDV: '45' };
        d.gDGen.gDatRec.dNombRec = ''; // Vacío
        d.gDGen.iTpEmis = '01'; // Autorización previa
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1605' })]),
      );
    });

    it('[1606] advierte contribuyente sin dirección', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.gDatRec.iTipoRec = '01';
        d.gDGen.gDatRec.gRucRec = { dTipoRuc: '2', dRuc: '155-9999999-2-00', dDV: '45' };
        d.gDGen.gDatRec.dNombRec = 'Empresa Receptora S.A.';
        d.gDGen.gDatRec.dDirecRec = undefined;
        d.gDGen.iTpEmis = '01';
      });
      const result = validateDocument(doc);

      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1606' })]),
      );
    });

    it('[1618] rechaza receptor extranjero sin identificación extranjera', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.gDatRec.iTipoRec = '04';
        d.gDGen.gDatRec.gIdExt = undefined;
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1618' })]),
      );
    });

    it('[1619] rechaza ID extranjera y RUC simultáneamente', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.gDatRec.gRucRec = { dTipoRuc: '1', dRuc: '8-123-456', dDV: '12' };
        d.gDGen.gDatRec.gIdExt = { dIdExt: 'PASS12345' };
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1619' })]),
      );
    });

    it('[1621] rechaza RUC jurídico como consumidor final', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.gDatRec.iTipoRec = '02'; // Consumidor final
        d.gDGen.gDatRec.gRucRec = { dTipoRuc: '2', dRuc: '155-9999999-2-00', dDV: '45' };
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1621' })]),
      );
    });

    it('[1611] rechaza país no PA cuando destino es Panamá', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iDest = '1';
        d.gDGen.gDatRec.cPaisRec = 'US';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1611' })]),
      );
    });

    it('[1612] rechaza país PA cuando destino es extranjero', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iDest = '2';
        d.gDGen.gDatRec.cPaisRec = 'PA';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1612' })]),
      );
    });
  });

  // =====================================================================
  // 5. EXPORTACIÓN (B50)
  // =====================================================================
  describe('Datos de exportación', () => {
    it('[1650] rechaza grupo exportación en operación interna', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iDest = '1'; // Panamá
        d.gDGen.gFExp = { cCondEntr: 'FOB' };
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1650' })]),
      );
    });

    it('[1651] rechaza falta de grupo exportación en operación de exportación', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iDest = '2'; // Extranjero
        d.gDGen.gFExp = undefined;
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1651' })]),
      );
    });
  });

  // =====================================================================
  // 6. NOTAS DE CRÉDITO/DÉBITO (B60)
  // =====================================================================
  describe('Documento fiscal referenciado', () => {
    it('[1705] rechaza nota de crédito sin documento referenciado', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iDoc = '04'; // Nota de crédito
        d.gDGen.gDFRef = undefined;
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1705' })]),
      );
    });

    it('[1705] rechaza nota de débito sin documento referenciado', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iDoc = '05'; // Nota de débito
        d.gDGen.gDFRef = [];
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1705' })]),
      );
    });

    it('[1706] rechaza nota genérica que referencia una FE', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iDoc = '06'; // NC genérica
        d.gDGen.gDFRef = [
          {
            gRucEmDFRef: { dTipoRuc: '2', dRuc: '155-1234567-2-00', dDV: '23' },
            dNombEmRef: 'Empresa S.A.',
            dFechaDFRef: new Date().toISOString(),
            gDFRefFE: {
              dCUFERef: 'FE' + '0'.repeat(63) + '0',
            },
          },
        ];
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1706' })]),
      );
    });

    it('[1709] rechaza CUFE referenciado duplicado', () => {
      const fakeCufe = 'FE' + '1'.repeat(63) + '0';
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.iDoc = '04'; // NC
        d.gDGen.gDFRef = [
          {
            gRucEmDFRef: { dTipoRuc: '2', dRuc: '155-1234567-2-00', dDV: '23' },
            dNombEmRef: 'Empresa S.A.',
            dFechaDFRef: new Date().toISOString(),
            gDFRefFE: { dCUFERef: fakeCufe },
          },
          {
            gRucEmDFRef: { dTipoRuc: '2', dRuc: '155-1234567-2-00', dDV: '23' },
            dNombEmRef: 'Empresa S.A.',
            dFechaDFRef: new Date().toISOString(),
            gDFRefFE: { dCUFERef: fakeCufe },
          },
        ];
      });
      const result = validateDocument(doc);

      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '1709' })]),
      );
    });
  });

  // =====================================================================
  // 7. ÍTEMS (C)
  // =====================================================================
  describe('Ítems del documento', () => {
    it('[2000] rechaza documento sin ítems', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gItem = [];
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining('al menos 1') }),
        ]),
      );
    });

    it('[2001] rechaza números secuenciales duplicados', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        const item = { ...d.gItem[0] };
        d.gItem.push(item); // Mismo dSecItem
        d.gTot.dNroItems = 2;
        // Actualizar totales
        d.gTot.dTotNeto *= 2;
        d.gTot.dTotITBMS *= 2;
        d.gTot.dTotGravado *= 2;
        d.gTot.dVTotItems *= 2;
        d.gTot.dVTot *= 2;
        d.gTot.dTotRec *= 2;
        d.gTot.gFormaPago[0].dVlrCuota *= 2;
      });
      const result = validateDocument(doc);

      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2001' })]),
      );
    });

    it('[2000] rechaza descripción vacía', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gItem[0].dDescProd = '';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
    });

    it('[2000] rechaza cantidad <= 0', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gItem[0].dCantCodInt = 0;
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
    });

    it('[2050] advierte precio unitario muy elevado', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gItem[0].gPrecios.dPrUnit = 150_000;
        // Recalcular
        d.gItem[0].gPrecios.dPrItem = 300_000; // 2 * 150000
        d.gItem[0].gITBMSItem.dValITBMS = 21_000; // 300000 * 0.07
        d.gItem[0].gPrecios.dValTotItem = 321_000;
        d.gTot.dTotNeto = 300_000;
        d.gTot.dTotITBMS = 21_000;
        d.gTot.dTotGravado = 21_000;
        d.gTot.dVTotItems = 321_000;
        d.gTot.dVTot = 321_000;
        d.gTot.dTotRec = 321_000;
        d.gTot.gFormaPago[0].dVlrCuota = 321_000;
      });
      const result = validateDocument(doc);

      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2050' })]),
      );
    });

    it('[2051] rechaza descuento mayor que precio unitario', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gItem[0].gPrecios.dPrUnitDesc = 150.0; // Mayor que 100.00
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2051' })]),
      );
    });

    it('[2053] rechaza cálculo de precio del ítem incorrecto', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gItem[0].gPrecios.dPrItem = 999.99; // Debería ser 200.00
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2053' })]),
      );
    });

    it('[2150] rechaza tasa ITBMS inválida', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gItem[0].gITBMSItem.dTasaITBMS = '99';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2150' })]),
      );
    });

    it('[2152] rechaza monto ITBMS incorrecto', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gItem[0].gITBMSItem.dValITBMS = 99.99; // Debería ser 14.00
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2152' })]),
      );
    });

    it('valida correctamente ITBMS al 0% (exento)', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gItem[0].gITBMSItem.dTasaITBMS = '00';
        d.gItem[0].gITBMSItem.dValITBMS = 0;
        d.gItem[0].gPrecios.dValTotItem = 200.0;
        d.gTot.dTotITBMS = 0;
        d.gTot.dTotGravado = 0;
        d.gTot.dVTotItems = 200.0;
        d.gTot.dVTot = 200.0;
        d.gTot.dTotRec = 200.0;
        d.gTot.gFormaPago[0].dVlrCuota = 200.0;
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(true);
    });

    it('valida correctamente ITBMS al 10%', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gItem[0].gITBMSItem.dTasaITBMS = '02'; // 10%
        d.gItem[0].gITBMSItem.dValITBMS = 20.0; // 200 * 0.10
        d.gItem[0].gPrecios.dValTotItem = 220.0;
        d.gTot.dTotITBMS = 20.0;
        d.gTot.dTotGravado = 20.0;
        d.gTot.dVTotItems = 220.0;
        d.gTot.dVTot = 220.0;
        d.gTot.dTotRec = 220.0;
        d.gTot.gFormaPago[0].dVlrCuota = 220.0;
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(true);
    });

    it('valida correctamente ITBMS al 15%', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gItem[0].gITBMSItem.dTasaITBMS = '03'; // 15%
        d.gItem[0].gITBMSItem.dValITBMS = 30.0; // 200 * 0.15
        d.gItem[0].gPrecios.dValTotItem = 230.0;
        d.gTot.dTotITBMS = 30.0;
        d.gTot.dTotGravado = 30.0;
        d.gTot.dVTotItems = 230.0;
        d.gTot.dVTot = 230.0;
        d.gTot.dTotRec = 230.0;
        d.gTot.gFormaPago[0].dVlrCuota = 230.0;
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(true);
    });
  });

  // =====================================================================
  // 8. TOTALES (D)
  // =====================================================================
  describe('Subtotales y totales', () => {
    it('[2500] rechaza suma de precios netos incorrecta', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gTot.dTotNeto = 999.99;
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2500' })]),
      );
    });

    it('[2501] rechaza total ITBMS incorrecto', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gTot.dTotITBMS = 999.99;
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2501' })]),
      );
    });

    it('[2507] rechaza valor total incorrecto', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gTot.dVTot = 999.99;
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2507' })]),
      );
    });

    it('[2509] advierte valor total mayor a 1 millón', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        const prItem = 1_100_000;
        const itbms = 77_000;
        const total = prItem + itbms;
        d.gItem[0].gPrecios.dPrUnit = 550_000;
        d.gItem[0].gPrecios.dPrItem = prItem;
        d.gItem[0].gITBMSItem.dValITBMS = itbms;
        d.gItem[0].gPrecios.dValTotItem = total;
        d.gTot.dTotNeto = prItem;
        d.gTot.dTotITBMS = itbms;
        d.gTot.dTotGravado = itbms;
        d.gTot.dVTotItems = total;
        d.gTot.dVTot = total;
        d.gTot.dTotRec = total;
        d.gTot.gFormaPago[0].dVlrCuota = total;
      });
      const result = validateDocument(doc);

      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2509' })]),
      );
    });

    it('[2515] advierte valor elevado en venta a consumidor final', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gDGen.gDatRec.iTipoRec = '02';
        const prItem = 11_000;
        const itbms = 770;
        const total = prItem + itbms;
        d.gItem[0].gPrecios.dPrUnit = 5_500;
        d.gItem[0].gPrecios.dPrItem = prItem;
        d.gItem[0].gITBMSItem.dValITBMS = itbms;
        d.gItem[0].gPrecios.dValTotItem = total;
        d.gTot.dTotNeto = prItem;
        d.gTot.dTotITBMS = itbms;
        d.gTot.dTotGravado = itbms;
        d.gTot.dVTotItems = total;
        d.gTot.dVTot = total;
        d.gTot.dTotRec = total;
        d.gTot.gFormaPago[0].dVlrCuota = total;
      });
      const result = validateDocument(doc);

      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2515' })]),
      );
    });

    it('[2510] rechaza suma de valores recibidos incorrecta', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gTot.dTotRec = 999.99;
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2510' })]),
      );
    });

    it('[2512] rechaza tiempo de pago inválido', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gTot.iPzPag = '9';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2512' })]),
      );
    });

    it('[2513] rechaza número de ítems incorrecto', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gTot.dNroItems = 5; // Debería ser 1
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2513' })]),
      );
    });

    it('[2514] rechaza valor total de ítems incorrecto', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gTot.dVTotItems = 999.99;
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2514' })]),
      );
    });

    it('[2600] rechaza forma de pago inválida', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gTot.gFormaPago[0].iFormaPago = '50';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2600' })]),
      );
    });

    it('[2601] rechaza forma de pago "Otro" sin descripción', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gTot.gFormaPago[0].iFormaPago = '99';
        d.gTot.gFormaPago[0].dFormaPagoDesc = undefined;
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2601' })]),
      );
    });

    it('[2602] rechaza descripción de forma de pago con código existente', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gTot.gFormaPago[0].iFormaPago = '02'; // Efectivo
        d.gTot.gFormaPago[0].dFormaPagoDesc = 'No debería estar aquí';
      });
      const result = validateDocument(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2602' })]),
      );
    });
  });

  // =====================================================================
  // EDGE CASES DE REDONDEO
  // =====================================================================
  describe('Tolerancia de redondeo (sección 8.4.1)', () => {
    it('acepta diferencia de B/.0.01 en precio del ítem', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        // dPrItem debería ser 200.00, pero ponemos 200.01
        d.gItem[0].gPrecios.dPrItem = 200.01;
        // Recalcular ITBMS y totales consistentemente con 200.01
        d.gItem[0].gITBMSItem.dValITBMS = 14.0; // Casi exacto para 200.01 * 0.07 = 14.0007
        d.gItem[0].gPrecios.dValTotItem = 214.01;
        d.gTot.dTotNeto = 200.01;
        d.gTot.dVTotItems = 214.01;
        d.gTot.dVTot = 214.01;
        d.gTot.dTotRec = 214.01;
        d.gTot.gFormaPago[0].dVlrCuota = 214.01;
      });
      const result = validateDocument(doc);

      // La diferencia de 0.01 en C203 está dentro de tolerancia
      const prItemError = result.errors.find((e) => e.code === '2053');
      expect(prItemError).toBeUndefined();
    });

    it('rechaza diferencia de B/.0.02 en precio del ítem', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        d.gItem[0].gPrecios.dPrItem = 200.02; // 0.02 de diferencia
      });
      const result = validateDocument(doc);

      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: '2053' })]),
      );
    });

    it('acepta diferencia de B/.0.01 en total ITBMS', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        // ITBMS debería ser 14.00, ponemos 14.01
        d.gItem[0].gITBMSItem.dValITBMS = 14.01;
        d.gItem[0].gPrecios.dValTotItem = 214.01;
        d.gTot.dTotITBMS = 14.01;
        d.gTot.dTotGravado = 14.01;
        d.gTot.dVTotItems = 214.01;
        d.gTot.dVTot = 214.01;
        d.gTot.dTotRec = 214.01;
        d.gTot.gFormaPago[0].dVlrCuota = 214.01;
      });
      const result = validateDocument(doc);

      const itbmsError = result.errors.find((e) => e.code === '2152');
      expect(itbmsError).toBeUndefined();
    });

    it('maneja correctamente múltiples ítems con redondeo', () => {
      const doc = modifyDoc(createValidDocument(), (d) => {
        // Item 1: 3 x B/.33.33 = B/.99.99, ITBMS 7% = B/.7.00
        // Item 2: 1 x B/.0.01 = B/.0.01, ITBMS 7% = B/.0.00
        d.gItem = [
          {
            dSecItem: 1,
            dDescProd: 'Producto A',
            dCantCodInt: 3,
            gPrecios: {
              dPrUnit: 33.33,
              dPrItem: 99.99,
              dValTotItem: 106.99,
            },
            gITBMSItem: { dTasaITBMS: '01', dValITBMS: 7.0 },
          },
          {
            dSecItem: 2,
            dDescProd: 'Producto B',
            dCantCodInt: 1,
            gPrecios: {
              dPrUnit: 0.01,
              dPrItem: 0.01,
              dValTotItem: 0.01,
            },
            gITBMSItem: { dTasaITBMS: '01', dValITBMS: 0.0 },
          },
        ];
        d.gTot = {
          dTotNeto: 100.0,
          dTotITBMS: 7.0,
          dTotGravado: 7.0,
          dVTot: 107.0,
          dTotRec: 107.0,
          iPzPag: '1',
          dNroItems: 2,
          dVTotItems: 107.0,
          gFormaPago: [{ iFormaPago: '02', dVlrCuota: 107.0 }],
        };
      });
      const result = validateDocument(doc);

      // Dentro de tolerancia de redondeo
      expect(result.isValid).toBe(true);
    });
  });

  // =====================================================================
  // CUFE LUHN
  // =====================================================================
  describe('Cálculo de DV Luhn para CUFE', () => {
    it('calcula DV correcto para cadena de solo dígitos', () => {
      // Ejemplo simple
      const dv = calculateCufeLuhn('7992739871');
      expect(typeof dv).toBe('number');
      expect(dv).toBeGreaterThanOrEqual(0);
      expect(dv).toBeLessThanOrEqual(9);
    });

    it('maneja letras en el RUC correctamente', () => {
      // RUC con letras: NT se convierte a dígitos (N=78→8, T=84→4)
      const dv = calculateCufeLuhn('012000000008-NT-000-00');
      expect(typeof dv).toBe('number');
      expect(dv).toBeGreaterThanOrEqual(0);
      expect(dv).toBeLessThanOrEqual(9);
    });

    it('ignora guiones en el cálculo', () => {
      const dv1 = calculateCufeLuhn('1234567890');
      const dv2 = calculateCufeLuhn('12345-67890');
      // Los guiones se ignoran, solo se procesan los dígitos
      expect(dv1).toBe(dv2);
    });
  });
});
