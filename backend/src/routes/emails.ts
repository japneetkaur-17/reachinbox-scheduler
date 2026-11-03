import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { countsForUser, getEmailDetail, listEmailsForUser, listSenders } from '../db/repositories';
import { htmlToText } from '../lib/html';
import { scheduleCampaign, scheduleSchema } from '../services/emailService';
import { searchEmails } from '../lib/elastic';
import { asyncHandler } from './asyncHandler';

const router = Router();
router.use(requireAuth);

/** POST /api/emails/schedule  - create a campaign and schedule one job per recipient */
router.post(
  '/schedule',
  asyncHandler(async (req, res) => {
    const input = scheduleSchema.parse(req.body);
    const result = await scheduleCampaign(req.user!.id, input);
    res.status(201).json(result);
  }),
);

const listQuery = z.object({
  tab: z.enum(['scheduled', 'sent']),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** GET /api/emails?tab=scheduled|sent&page=1&pageSize=50 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const { items, total } = await listEmailsForUser(req.user!.id, q.tab, q.page, q.pageSize);
    // Lists only need a one-line preview of the body.
    const withPreview = items.map((i) => ({ ...i, body: htmlToText(i.body).replace(/\s+/g, ' ').slice(0, 160) }));
    res.json({ items: withPreview, total, page: q.page, pageSize: q.pageSize });
  }),
);

/** GET /api/emails/stats -> { scheduled, sent } counts for the sidebar */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    res.json(await countsForUser(req.user!.id));
  }),
);

/** GET /api/emails/senders - the sender pool, for the "From" picker */
router.get(
  '/senders',
  asyncHandler(async (_req, res) => {
    const senders = await listSenders();
    res.json({ items: senders.map((s) => ({ id: s.id, email: s.email })) });
  }),
);

const searchQuery = z.object({
  q: z.string().trim().min(1),
  tab: z.enum(['scheduled', 'sent']).optional(),
});

/** GET /api/emails/search?q=...&tab=... - full-text search served by Elasticsearch */
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const { q, tab } = searchQuery.parse(req.query);
    const statuses = tab === 'scheduled' ? ['scheduled', 'processing'] : tab === 'sent' ? ['sent', 'failed'] : undefined;
    try {
      const hits = await searchEmails(req.user!.id, q, statuses as never);
      res.json({ items: hits });
    } catch (err) {
      res.status(503).json({ error: 'Search is unavailable (Elasticsearch not reachable)' });
    }
  }),
);

/** GET /api/emails/:id - one email (only if it belongs to the current user) */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const email = await getEmailDetail(req.user!.id, id);
    if (!email) return res.status(404).json({ error: 'Email not found' });
    res.json({ item: email });
  }),
);

export default router;
