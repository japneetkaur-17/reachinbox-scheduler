import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ZodError } from 'zod';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { env } from './config/env';
import { emailQueue } from './queue/emailQueue';
import authRoutes from './routes/auth';
import emailRoutes from './routes/emails';
import slackRoutes from './routes/slack';
import { HttpError } from './services/emailService';
import { logger } from './lib/logger';

export function createApp() {
  const app = express();

  // Bull Board renders its own inline scripts, so CSP is relaxed for the API.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '5mb' })); // large lead lists
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // ---- Live BullMQ dashboard: http://localhost:4000/admin/queues ----
  const boardAdapter = new ExpressAdapter();
  boardAdapter.setBasePath('/admin/queues');
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: boardAdapter });
  if (env.BULL_BOARD_USER && env.BULL_BOARD_PASSWORD) {
    app.use('/admin/queues', (req, res, next) => {
      const expected = 'Basic ' + Buffer.from(`${env.BULL_BOARD_USER}:${env.BULL_BOARD_PASSWORD}`).toString('base64');
      if (req.headers.authorization === expected) return next();
      res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"').status(401).send('Auth required');
    });
  }
  app.use('/admin/queues', boardAdapter.getRouter());

  app.use('/api/auth', authRoutes);
  app.use('/api/emails', emailRoutes);
  app.use('/api/slack', slackRoutes);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.flatten().fieldErrors });
    }
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    logger.error('Unhandled error', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
