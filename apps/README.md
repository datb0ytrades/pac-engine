# PAC Apps

## Emisor (pac-app-emisor)

App para emisores de facturas electrónicas.

### Servicios (`services/pac-api.ts`)

- **emitInvoice(invoiceData)** – Llama a la Edge Function `emit-document`
- **getInvoices(filters)** – Consulta la tabla `documents` vía Supabase
- **cancelInvoice(id, reason)** – Llama a `cancel-document`
- **downloadPDF(id)** – Llama a `generate-cafe-pdf`, retorna Blob del PDF

### Variables de entorno

```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## Consumidor (pac-app-consumidor)

App para consumidores que registran gastos y comprobantes.

### Servicios

**expenses-api.ts**
- **saveReceipt(data, imageUri?)** – Guarda en `received_documents` y sube imagen a Storage
- **categorizeExpense(merchant, amount, description?)** – Llama a la Edge Function `categorize-expense`
- **getExpensesByCategory(month, year)** – Gastos agrupados por categoría
- **calculateDeductions(year, financialProfile)** – Cálculo de deducciones fiscales

**camera.ts**
- **takePhoto()** – Toma foto con expo-image-picker (cámara)
- **pickImage()** – Selecciona imagen de galería
- **uploadImage(uri)** – Sube imagen a Supabase Storage (bucket `receipts`)

### Variables de entorno

```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

### Migraciones requeridas

Ejecuta las migraciones de Supabase para crear:

- `received_documents` (002_create_received_documents.sql)
- Bucket `receipts` (003_create_receipts_bucket.sql)
