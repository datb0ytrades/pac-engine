import express from 'express';
import { env } from './config/env';
import { requestLoggerMiddleware } from './middleware/request-logger';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { errorHandlerMiddleware } from './middleware/error-handler';
import apiRouter from './api';

const app = express();

// --- Parsers ---
app.use(express.json({ limit: '5mb' }));
app.use(express.text({ type: 'application/xml', limit: '5mb' }));

// --- Logging de requests (todas las rutas) ---
app.use(requestLoggerMiddleware);

// --- Health check (sin autenticación) ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', environment: env.DGI_ENVIRONMENT });
});

// --- API routes (con auth + rate limit) ---
app.use(
  '/api',
  authMiddleware as express.RequestHandler,
  rateLimitMiddleware as express.RequestHandler,
  apiRouter,
);

// --- Error handler global (siempre al final) ---
app.use(errorHandlerMiddleware);

app.listen(env.PORT, () => {
  console.log(`PAC server running on port ${env.PORT} [${env.NODE_ENV}]`);
});

export default app;
