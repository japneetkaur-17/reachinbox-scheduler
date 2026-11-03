import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env, isProd } from '../config/env';
import type { AuthUser } from '../types';

export const AUTH_COOKIE = 'es_session';
const SESSION_TTL_S = 7 * 24 * 3600;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function setSessionCookie(res: Response, user: AuthUser) {
  const token = jwt.sign(user, env.JWT_SECRET, { expiresIn: SESSION_TTL_S });
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: SESSION_TTL_S * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
}

export function readSession(req: Request): AuthUser | null {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return null;
  try {
    const p = jwt.verify(token, env.JWT_SECRET) as AuthUser & jwt.JwtPayload;
    return { id: p.id, email: p.email, name: p.name, avatarUrl: p.avatarUrl };
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = readSession(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}

/** Short-lived signed `state` for OAuth round trips (CSRF + carries the user id). */
export function signState(payload: object, ttlSeconds = 600): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ttlSeconds });
}
export function verifyState<T>(state: string): T | null {
  try {
    return jwt.verify(state, env.JWT_SECRET) as T;
  } catch {
    return null;
  }
}
