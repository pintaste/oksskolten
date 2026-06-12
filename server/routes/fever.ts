import { createHash, timingSafeEqual } from 'node:crypto'
import { parse as parseQuerystring } from 'node:querystring'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { Marked } from 'marked'
import {
  getSetting,
  upsertSetting,
  markArticleSeen,
  markArticlesSeen,
  markArticlesUnseen,
  markArticleBookmarked,
} from '../db.js'
import {
  getFeverGroups,
  getFeverFeedsGroups,
  getFeverFeeds,
  getFeverItems,
  getFeverTotalItems,
  getFeverUnreadItemIds,
  getFeverSavedItemIds,
  getFeverLastRefreshedOnTime,
  getFeverUnseenIdsBefore,
  getFeverRecentlySeenIds,
  FEVER_ITEMS_LIMIT,
  type FeverItemRow,
} from '../db/fever.js'
import { requireJson } from '../auth.js'
import { parseOrBadRequest } from '../lib/validation.js'

// Fever API (https://feedafever.com/api): a de facto standard sync protocol
// supported by RSS clients such as Reeder, ReadKit and Unread.
// Single endpoint, authenticated with api_key = md5("username:password")
// sent as POST form data. Read arguments live in the query string, write
// arguments in the POST body. Auth failures still return HTTP 200 with auth: 0.

const FEVER_API_VERSION = 3

export const FEVER_ENABLED_KEY = 'fever.enabled'
export const FEVER_USERNAME_KEY = 'fever.username'
export const FEVER_API_KEY_HASH_KEY = 'fever.api_key_hash'

// Plain renderer without highlight: Fever clients style article HTML themselves
const markdownRenderer = new Marked()

export function md5Hex(input: string): string {
  return createHash('md5').update(input).digest('hex')
}

function isValidFeverApiKey(provided: string): boolean {
  const stored = getSetting(FEVER_API_KEY_HASH_KEY)
  if (!stored) return false
  const a = Buffer.from(provided.toLowerCase())
  const b = Buffer.from(stored)
  return a.length === b.length && timingSafeEqual(a, b)
}

function renderItem(row: FeverItemRow) {
  const markdown = row.full_text || row.excerpt || ''
  return {
    id: row.id,
    feed_id: row.feed_id,
    title: row.title,
    author: '',
    html: markdownRenderer.parse(markdown, { async: false }),
    url: row.url,
    is_saved: row.is_saved,
    is_read: row.is_read,
    created_on_time: row.created_on_time,
  }
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

function handleMark(body: Record<string, string | undefined>, response: Record<string, unknown>): void {
  const id = Number(body.id)
  if (!Number.isInteger(id)) return

  if (body.mark === 'item') {
    switch (body.as) {
      case 'read':
        markArticleSeen(id, true)
        break
      case 'unread':
        markArticleSeen(id, false)
        break
      case 'saved':
        markArticleBookmarked(id, true)
        break
      case 'unsaved':
        markArticleBookmarked(id, false)
        break
      default:
        return
    }
    if (body.as === 'saved' || body.as === 'unsaved') {
      response.saved_item_ids = getFeverSavedItemIds().join(',')
    } else {
      response.unread_item_ids = getFeverUnreadItemIds().join(',')
    }
    return
  }

  if ((body.mark === 'feed' || body.mark === 'group') && body.as === 'read') {
    const before = Number(body.before) || Math.floor(Date.now() / 1000)
    let ids: number[]
    if (body.mark === 'feed') {
      ids = getFeverUnseenIdsBefore({ feedId: id }, before)
    } else if (id === 0) {
      // Kindling super group = all feeds (this app has no Sparks concept)
      ids = getFeverUnseenIdsBefore({}, before)
    } else if (id === -1) {
      // Sparks super group: no spark feeds exist
      ids = []
    } else {
      ids = getFeverUnseenIdsBefore({ categoryId: id }, before)
    }
    markArticlesSeen(ids)
    response.unread_item_ids = getFeverUnreadItemIds().join(',')
  }
}

async function feverHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const query = request.query as Record<string, string | undefined>
  if (!('api' in query)) {
    return reply.status(404).send({ error: 'Not found' })
  }

  const body = (typeof request.body === 'object' && request.body !== null
    ? request.body
    : {}) as Record<string, string | undefined>

  const response: Record<string, unknown> = { api_version: FEVER_API_VERSION, auth: 0 }

  const apiKey = typeof body.api_key === 'string' ? body.api_key : ''
  if (getSetting(FEVER_ENABLED_KEY) !== 'on' || !apiKey || !isValidFeverApiKey(apiKey)) {
    return reply.send(response)
  }
  response.auth = 1
  response.last_refreshed_on_time = getFeverLastRefreshedOnTime()

  // --- Reads (query string arguments) ---
  if ('groups' in query) {
    response.groups = getFeverGroups()
    response.feeds_groups = getFeverFeedsGroups()
  }
  if ('feeds' in query) {
    response.feeds = getFeverFeeds()
    response.feeds_groups = getFeverFeedsGroups()
  }
  if ('favicons' in query) {
    response.favicons = []
  }
  if ('items' in query) {
    const withIds = query.with_ids !== undefined
      ? query.with_ids.split(',').map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, FEVER_ITEMS_LIMIT)
      : undefined
    response.items = getFeverItems({
      sinceId: parsePositiveInt(query.since_id),
      maxId: parsePositiveInt(query.max_id),
      withIds,
    }).map(renderItem)
    response.total_items = getFeverTotalItems()
  }
  if ('links' in query) {
    response.links = []
  }
  if ('unread_item_ids' in query) {
    response.unread_item_ids = getFeverUnreadItemIds().join(',')
  }
  if ('saved_item_ids' in query) {
    response.saved_item_ids = getFeverSavedItemIds().join(',')
  }

  // --- Writes (POST body arguments) ---
  if (body.unread_recently_read === '1') {
    markArticlesUnseen(getFeverRecentlySeenIds())
    response.unread_item_ids = getFeverUnreadItemIds().join(',')
  }
  if (typeof body.mark === 'string') {
    handleMark(body, response)
  }

  return reply.send(response)
}

/**
 * Public Fever endpoint. Registered outside requireAuth: the protocol has
 * its own api_key authentication and must answer HTTP 200 with auth: 0
 * on failure (clients treat 401 as a server error).
 */
export async function feverRoutes(app: FastifyInstance): Promise<void> {
  // Fever clients submit api_key (and write arguments) as form data.
  // Parser is scoped to this plugin and does not affect the JSON API.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, payload, done) => {
    done(null, parseQuerystring(payload as string))
  })

  app.post('/api/fever', feverHandler)
  app.get('/api/fever', feverHandler)
}

const FeverConfigBody = z.object({
  enabled: z.boolean().optional(),
  username: z.string().min(1).max(100).optional(),
  password: z.string().min(1).max(200).optional(),
})

function feverConfigState() {
  return {
    enabled: getSetting(FEVER_ENABLED_KEY) === 'on',
    username: getSetting(FEVER_USERNAME_KEY) ?? '',
    configured: !!getSetting(FEVER_API_KEY_HASH_KEY),
  }
}

/** Fever settings management. Registered inside the authenticated API scope. */
export async function feverConfigRoutes(api: FastifyInstance): Promise<void> {
  api.get('/api/settings/fever', async (_request, reply) => {
    reply.send(feverConfigState())
  })

  api.patch(
    '/api/settings/fever',
    { preHandler: [requireJson] },
    async (request, reply) => {
      const body = parseOrBadRequest(FeverConfigBody, request.body, reply)
      if (!body) return

      if (body.username !== undefined || body.password !== undefined) {
        if (body.username === undefined || body.password === undefined) {
          return reply.status(400).send({ error: 'username and password must be provided together' })
        }
        upsertSetting(FEVER_USERNAME_KEY, body.username)
        upsertSetting(FEVER_API_KEY_HASH_KEY, md5Hex(`${body.username}:${body.password}`))
      }

      if (body.enabled !== undefined) {
        if (body.enabled && !getSetting(FEVER_API_KEY_HASH_KEY)) {
          return reply.status(400).send({ error: 'Set username and password before enabling the Fever API' })
        }
        upsertSetting(FEVER_ENABLED_KEY, body.enabled ? 'on' : 'off')
      }

      reply.send(feverConfigState())
    },
  )
}
