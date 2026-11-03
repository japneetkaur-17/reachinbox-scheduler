import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env';
import { logger } from './logger';
import type { EmailStatus } from '../types';

/**
 * Elasticsearch is a secondary (search) index. MySQL stays the source of truth,
 * so every ES call is best-effort: a search-cluster outage must never block
 * scheduling or sending.
 */
export const es = new Client({ node: env.ELASTICSEARCH_URL });
const INDEX = env.ELASTICSEARCH_INDEX;

export interface EmailDoc {
  id: number;
  user_id: number;
  campaign_id: number;
  recipient: string;
  sender: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduled_at: string;
  sent_at: string | null;
}

export async function ensureIndex(): Promise<void> {
  try {
    const exists = await es.indices.exists({ index: INDEX });
    if (exists) return;
    await es.indices.create({
      index: INDEX,
      mappings: {
        properties: {
          id: { type: 'long' },
          user_id: { type: 'integer' },
          campaign_id: { type: 'integer' },
          // text for fuzzy search + keyword for exact match / sorting
          recipient: { type: 'text', fields: { keyword: { type: 'keyword' } } },
          sender: { type: 'keyword' },
          subject: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
          body: { type: 'text' },
          status: { type: 'keyword' },
          scheduled_at: { type: 'date' },
          sent_at: { type: 'date' },
        },
      },
    });
    logger.info(`Elasticsearch index "${INDEX}" created`);
  } catch (err) {
    logger.warn(`Elasticsearch unavailable, search disabled until it is up: ${(err as Error).message}`);
  }
}

export async function indexEmails(docs: EmailDoc[]): Promise<void> {
  if (docs.length === 0) return;
  try {
    const operations = docs.flatMap((d) => [{ index: { _index: INDEX, _id: String(d.id) } }, d]);
    const res = await es.bulk({ operations, refresh: false });
    if (res.errors) logger.warn('Elasticsearch bulk index reported item errors');
  } catch (err) {
    logger.warn(`ES bulk index failed: ${(err as Error).message}`);
  }
}

export async function updateEmailDoc(id: number, patch: Partial<EmailDoc>): Promise<void> {
  try {
    await es.update({ index: INDEX, id: String(id), doc: patch, retry_on_conflict: 3 });
  } catch (err) {
    logger.warn(`ES update for email ${id} failed: ${(err as Error).message}`);
  }
}

export async function searchEmails(userId: number, q: string, status?: EmailStatus[], size = 50) {
  const res = await es.search<EmailDoc>({
    index: INDEX,
    size,
    query: {
      bool: {
        filter: [{ term: { user_id: userId } }, ...(status?.length ? [{ terms: { status } }] : [])],
        must: [
          {
            multi_match: {
              query: q,
              fields: ['recipient^3', 'subject^2', 'body', 'sender'],
              fuzziness: 'AUTO',
              operator: 'and',
            },
          },
        ],
      },
    },
    sort: [{ _score: { order: 'desc' } }, { scheduled_at: { order: 'desc' } }],
  });
  return res.hits.hits
    .map((h) => h._source!)
    .filter(Boolean)
    .map((d) => ({ ...d, body: d.body.replace(/\s+/g, ' ').slice(0, 160) }));
}
