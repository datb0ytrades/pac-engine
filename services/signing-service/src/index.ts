// ============================================================================
// Signing Microservice — Express server
// Firma XAdES-BES para documentos fiscales electrónicos de Panamá
//
// Endpoints:
//   POST /sign    — Firma un XML con XAdES-BES
//   POST /verify  — Verifica la firma de un XML
//   GET  /health  — Health check
//
// Autenticación: Header X-Signing-Secret
// ============================================================================

import express from 'express';
import cors from 'cors';
import { signingSecretAuth } from './middleware/auth';
import { signRouter } from './routes/sign';
import { verifyRouter } from './routes/verify';
import { healthRouter } from './routes/health';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check (sin autenticación)
app.use('/health', healthRouter);

// Rutas protegidas
app.use('/sign', signingSecretAuth, signRouter);
app.use('/verify', signingSecretAuth, verifyRouter);

// Error handler global
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[SIGNING-SERVICE ERROR]', err.message, err.stack);
  res.status(500).json({
    error: 'Error interno del servicio de firma',
    message: err.message,
  });
});

app.listen(PORT, () => {
  console.log(`[SIGNING-SERVICE] Listening on port ${PORT}`);
  console.log(`[SIGNING-SERVICE] Health: http://localhost:${PORT}/health`);
});

export default app;
