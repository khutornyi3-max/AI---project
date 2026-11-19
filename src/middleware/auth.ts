import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';

export interface AuthenticatedRequest extends Request {
  user?: DecodedIdToken;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Потрібна авторизація.' });
    return;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    res.status(401).json({ error: 'Потрібна авторизація.' });
    return;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    req.user = decoded;
    next();
  } catch (error: unknown) {
    console.error('Firebase token verification failed:', error);
    res.status(401).json({ error: 'Сесія недійсна або протермінована.' });
  }
}
