// ============================================================================
// Health check endpoint
// ============================================================================

import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'pac-signing-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});
