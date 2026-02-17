import { generateCufeHash, CufeInput } from '../src/cufe';

describe('CUFE generation', () => {
  it('should generate a SHA-384 hex string', () => {
    const input: CufeInput = {
      documentNumber: 'FE001-00000001',
      emissionDate: '2025-01-15T10:30:00',
      emitterRuc: '155-1234567-2-00',
      totalAmount: 110.0,
      taxAmount: 10.0,
    };

    const cufe = generateCufeHash(input);

    expect(cufe).toHaveLength(96); // SHA-384 = 96 hex chars
    expect(cufe).toMatch(/^[a-f0-9]+$/);
  });

  it('should produce deterministic output', () => {
    const input: CufeInput = {
      documentNumber: 'FE001-00000002',
      emissionDate: '2025-01-15T12:00:00',
      emitterRuc: '155-9876543-2-00',
      totalAmount: 200.5,
      taxAmount: 14.04,
    };

    const cufe1 = generateCufeHash(input);
    const cufe2 = generateCufeHash(input);

    expect(cufe1).toBe(cufe2);
  });

  it('should produce different output for different inputs', () => {
    const base: CufeInput = {
      documentNumber: 'FE001-00000003',
      emissionDate: '2025-01-15T14:00:00',
      emitterRuc: '155-1111111-2-00',
      totalAmount: 50.0,
      taxAmount: 3.5,
    };

    const cufe1 = generateCufeHash(base);
    const cufe2 = generateCufeHash({ ...base, totalAmount: 51.0 });

    expect(cufe1).not.toBe(cufe2);
  });
});
