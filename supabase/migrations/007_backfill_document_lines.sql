-- ============================================================================
-- Backfill document_lines para documentos existentes sin líneas
-- Inserta una línea sintética por documento usando total_amount
-- Solo afecta documentos que aún no tienen filas en document_lines
-- ============================================================================

-- Insertar líneas sintéticas para documentos que no tienen ninguna
-- unit_price = subtotal (total_amount - total_tax), itbms_amount = total_tax, line_total = total_amount
INSERT INTO document_lines (
  document_id,
  line_number,
  description,
  quantity,
  unit_price,
  itbms_rate,
  itbms_amount,
  line_total
)
SELECT
  d.id,
  1,
  'Producto/Servicio',
  1,
  COALESCE(d.total_amount, 0) - COALESCE(d.total_tax, 0),
  0,
  COALESCE(d.total_tax, 0),
  COALESCE(d.total_amount, 0)
FROM documents d
WHERE COALESCE(d.total_amount, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM document_lines dl WHERE dl.document_id = d.id
  );
