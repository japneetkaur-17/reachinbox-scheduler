import { Router } from 'express';
import { env } from '../config/env';
import { requireAuth, signState, verifyState } from '../middleware/auth';
import { getSlackConnection } from '../db/repositories';
import { buildSlackAuthorizeUrl, disconnectSlack, exchangeSlackCode, slackConfigured } from '../services/slack';
import { asyncHandler } from './asyncHandler';
import { logger } from '../lib/logger';

const router = Router();

/** GET /api/slack/status */
router.get(
  '/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const conn = await getSlackConnection(req.user!.id);
    res.json({
      configured: slackConfigured(),
      connected: Boolean(conn),
      teamName: conn?.team_name ?? null,
      channel: conn?.channel ?? null,
      connectedAt: conn?.connected_at ?? null,
    });
  }),
);

/** GET /api/slack/connect - starts the OAuth flow (browser navigation, not fetch) */
router.get('/connect', requireAuth, (req, res) => {
  if (!slackConfigured()) return res.redirect(`${env.FRONTEND_URL}/scheduled?slack=not_configured`);
  // The callback lands on a different origin (ngrok) without our session cookie,
  // so the signed state carries the user id and protects against CSRF.
  const state = signState({ uid: req.user!.id, purpose: 'slack' });
  res.redirect(buildSlackAuthorizeUrl(state));
});

/** GET /api/slack/callback - Slack redirects here after the user picks a channel */
router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    const back = (status: string) => res.redirect(`${env.FRONTEND_URL}/scheduled?slack=${status}`);
    if (error) return back('denied');
    const parsed = state ? verifyState<{ uid: number; purpose: string }>(state) : null;
    if (!code || !parsed || parsed.purpose !== 'slack') return back('invalid_state');
    try {
      await exchangeSlackCode(parsed.uid, code);
      back('connected');
    } catch (err) {
      logger.error((err as Error).message);
      back('error');
    }
  }),
);

/** DELETE /api/slack - disconnect (revoke + forget webhook) */
router.delete(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    await disconnectSlack(req.user!.id);
    res.json({ ok: true });
  }),
);

export default router;
