import crypto from 'crypto';
import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { env, isProd } from '../config/env';
import { upsertGoogleUser } from '../db/repositories';
import { clearSessionCookie, readSession, setSessionCookie } from '../middleware/auth';
import { logger } from '../lib/logger';

const router = Router();
const STATE_COOKIE = 'g_oauth_state';

const oauth = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);

/** Step 1: redirect the browser to Google's consent screen. */
router.get('/google', (_req, res) => {
  if (!env.GOOGLE_CLIENT_ID) return res.status(500).send('GOOGLE_CLIENT_ID is not configured');
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 10 * 60 * 1000 });
  const url = oauth.generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  });
  res.redirect(url);
});

/** Step 2: Google redirects back with ?code -> exchange, verify ID token, create session. */
router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  const fail = (reason: string) => res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(reason)}`);

  if (error) return fail(error);
  if (!code || !state || state !== req.cookies?.[STATE_COOKIE]) return fail('invalid_state');
  res.clearCookie(STATE_COOKIE);

  try {
    const { tokens } = await oauth.getToken(code);
    if (!tokens.id_token) return fail('no_id_token');
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email) return fail('invalid_profile');

    const user = await upsertGoogleUser({
      googleId: p.sub,
      email: p.email,
      name: p.name ?? p.email,
      avatarUrl: p.picture ?? null,
    });
    setSessionCookie(res, { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url });
    res.redirect(`${env.FRONTEND_URL}/scheduled`);
  } catch (err) {
    logger.error(`Google OAuth callback failed: ${(err as Error).message}`);
    fail('oauth_failed');
  }
});

router.get('/me', (req, res) => {
  const user = readSession(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user });
});

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

export default router;
