/**
 * Proveniq Capital - Authentication Middleware
 * API Key validation for admin endpoints
 */

import { Request, Response, NextFunction } from 'express';

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!expectedKey) {
    console.error('[Auth] ADMIN_API_KEY not configured');
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }

  if (!apiKey) {
    res.status(401).json({ error: 'Missing API key' });
    return;
  }

  if (apiKey !== expectedKey) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  next();
}

export function webhookAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Webhook authentication is handled by signature verification in the route handler
  // This middleware just ensures the request has a body
  if (!req.body || Object.keys(req.body).length === 0) {
    res.status(400).json({ error: 'Empty request body' });
    return;
  }

  next();
}
