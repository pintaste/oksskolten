import { createHash } from 'node:crypto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { buildApp } from '../__tests__/helpers/buildApp.js'
import { upsertSetting, getSetting, createCategory, createFeed, insertArticle, markArticleSeen, markArticleBookmarked } from '../db.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let savedAuthDisabled: string | undefined

const USERNAME = 'admin'
const PASSWORD = 'secret'
const API_KEY = createHash('md5').update(`${USERNAME}:${PASSWORD}`).digest('hex')

function configureFever(enabled = true) {
  upsertSetting('fever.enabled', enabled ? 'on' : 'off')
  upsertSetting('fever.username', USERNAME)
  upsertSetting('fever.api_key_hash', API_KEY)
}

async function fever(queryArgs: string, formArgs = '') {
  const res = await app.inject({
    method: 'POST',
    url: `/api/fever?api${queryArgs}`,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `api_key=${API_KEY}${formArgs}`,
  })
  expect(res.statusCode).toBe(200)
  return res.json()
}

beforeEach(async () => {
  setupTestDb()
  app = await buildApp()
  savedAuthDisabled = process.env.AUTH_DISABLED
  process.env.AUTH_DISABLED = '1'
})

afterEach(() => {
  if (savedAuthDisabled !== undefined) {
    process.env.AUTH_DISABLED = savedAuthDisabled
  } else {
    delete process.env.AUTH_DISABLED
  }
})

describe('Fever API authentication', () => {
  it('returns 404 without the api query argument', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/fever' })
    expect(res.statusCode).toBe(404)
  })

  it('returns auth 0 when the Fever API is not enabled', async () => {
    configureFever(false)
    const body = await fever('')
    expect(body).toEqual({ api_version: 3, auth: 0 })
  })

  it('returns auth 0 without an api_key', async () => {
    configureFever()
    const res = await app.inject({ method: 'POST', url: '/api/fever?api' })
    expect(res.statusCode).toBe(200)
    expect(res.json().auth).toBe(0)
  })

  it('returns auth 0 with a wrong api_key (still HTTP 200)', async () => {
    configureFever()
    const res = await app.inject({
      method: 'POST',
      url: '/api/fever?api',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `api_key=${createHash('md5').update('admin:wrong').digest('hex')}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().auth).toBe(0)
  })

  it('authenticates with the correct api_key', async () => {
    configureFever()
    const body = await fever('')
    expect(body.api_version).toBe(3)
    expect(body.auth).toBe(1)
    expect(body).toHaveProperty('last_refreshed_on_time')
  })
})

describe('Fever API reads', () => {
  let categoryId: number
  let feedId: number
  let unreadId: number
  let readId: number
  let savedId: number

  beforeEach(() => {
    configureFever()
    categoryId = createCategory('Tech').id
    feedId = createFeed({ name: 'Example', url: 'https://example.com', rss_url: 'https://example.com/rss', category_id: categoryId }).id
    unreadId = insertArticle({ feed_id: feedId, title: 'Unread', url: 'https://example.com/1', published_at: '2026-06-01 00:00:00', full_text: '# Hello\n\nWorld' })
    readId = insertArticle({ feed_id: feedId, title: 'Read', url: 'https://example.com/2', published_at: '2026-06-02 00:00:00', excerpt: 'plain excerpt' })
    savedId = insertArticle({ feed_id: feedId, title: 'Saved', url: 'https://example.com/3', published_at: '2026-06-03 00:00:00' })
    markArticleSeen(readId, true)
    markArticleBookmarked(savedId, true)
  })

  it('returns groups with feeds_groups', async () => {
    const body = await fever('&groups')
    expect(body.groups).toEqual([{ id: categoryId, title: 'Tech' }])
    expect(body.feeds_groups).toEqual([{ group_id: categoryId, feed_ids: String(feedId) }])
  })

  it('returns feeds with feeds_groups', async () => {
    const body = await fever('&feeds')
    expect(body.feeds).toHaveLength(1)
    expect(body.feeds[0]).toMatchObject({
      id: feedId,
      favicon_id: 0,
      title: 'Example',
      url: 'https://example.com/rss',
      site_url: 'https://example.com',
      is_spark: 0,
    })
    expect(body.feeds[0].last_updated_on_time).toBeGreaterThan(0)
    expect(body.feeds_groups).toEqual([{ group_id: categoryId, feed_ids: String(feedId) }])
  })

  it('returns empty favicons and links', async () => {
    const body = await fever('&favicons&links')
    expect(body.favicons).toEqual([])
    expect(body.links).toEqual([])
  })

  it('returns items with rendered html and read/saved flags', async () => {
    const body = await fever('&items')
    expect(body.total_items).toBe(3)
    expect(body.items).toHaveLength(3)

    const byId = new Map((body.items as Array<{ id: number; [k: string]: unknown }>).map(i => [i.id, i]))
    const unread = byId.get(unreadId)!
    expect(unread).toMatchObject({ feed_id: feedId, title: 'Unread', author: '', url: 'https://example.com/1', is_read: 0, is_saved: 0 })
    expect(unread.html).toContain('<h1>Hello</h1>')
    expect(unread.created_on_time).toBe(Math.floor(Date.parse('2026-06-01T00:00:00Z') / 1000))

    expect(byId.get(readId)!.is_read).toBe(1)
    expect(byId.get(readId)!.html).toContain('plain excerpt')
    expect(byId.get(savedId)!.is_saved).toBe(1)
  })

  it('paginates items with since_id and max_id', async () => {
    const since = await fever(`&items&since_id=${unreadId}`)
    expect((since.items as Array<{ id: number }>).map(i => i.id)).toEqual([readId, savedId])

    const max = await fever(`&items&max_id=${savedId}`)
    expect((max.items as Array<{ id: number }>).map(i => i.id)).toEqual([readId, unreadId])
  })

  it('returns specific items with with_ids', async () => {
    const body = await fever(`&items&with_ids=${unreadId},${savedId}`)
    expect((body.items as Array<{ id: number }>).map(i => i.id)).toEqual([unreadId, savedId])
  })

  it('returns unread_item_ids and saved_item_ids', async () => {
    const body = await fever('&unread_item_ids&saved_item_ids')
    expect(body.unread_item_ids).toBe([unreadId, savedId].join(','))
    expect(body.saved_item_ids).toBe(String(savedId))
  })
})

describe('Fever API writes', () => {
  let feedId: number
  let otherFeedId: number
  let articleId: number
  let otherArticleId: number

  beforeEach(() => {
    configureFever()
    feedId = createFeed({ name: 'A', url: 'https://a.example.com' }).id
    otherFeedId = createFeed({ name: 'B', url: 'https://b.example.com' }).id
    articleId = insertArticle({ feed_id: feedId, title: 'One', url: 'https://a.example.com/1', published_at: '2026-06-01 00:00:00' })
    otherArticleId = insertArticle({ feed_id: otherFeedId, title: 'Two', url: 'https://b.example.com/1', published_at: '2026-06-02 00:00:00' })
  })

  it('marks an item as read and returns unread_item_ids', async () => {
    const body = await fever('', `&mark=item&as=read&id=${articleId}`)
    expect(body.unread_item_ids).toBe(String(otherArticleId))
  })

  it('marks an item as unread again', async () => {
    await fever('', `&mark=item&as=read&id=${articleId}`)
    const body = await fever('', `&mark=item&as=unread&id=${articleId}`)
    expect(body.unread_item_ids).toBe([articleId, otherArticleId].join(','))
  })

  it('marks an item as saved and unsaved, returning saved_item_ids', async () => {
    const saved = await fever('', `&mark=item&as=saved&id=${articleId}`)
    expect(saved.saved_item_ids).toBe(String(articleId))

    const unsaved = await fever('', `&mark=item&as=unsaved&id=${articleId}`)
    expect(unsaved.saved_item_ids).toBe('')
  })

  it('marks a feed as read up to the before timestamp', async () => {
    const lateId = insertArticle({ feed_id: feedId, title: 'Late', url: 'https://a.example.com/2', published_at: '2026-06-10 00:00:00' })
    const before = Math.floor(Date.parse('2026-06-05T00:00:00Z') / 1000)

    const body = await fever('', `&mark=feed&as=read&id=${feedId}&before=${before}`)
    // The late article and the other feed's article remain unread
    expect(body.unread_item_ids).toBe([otherArticleId, lateId].join(','))
  })

  it('marks the Kindling super group (id=0) as read', async () => {
    const before = Math.floor(Date.now() / 1000) + 60
    const body = await fever('', `&mark=group&as=read&id=0&before=${before}`)
    expect(body.unread_item_ids).toBe('')
  })

  it('marks a category group as read', async () => {
    const categoryId = createCategory('Cat').id
    const catFeedId = createFeed({ name: 'C', url: 'https://c.example.com', category_id: categoryId }).id
    const catArticleId = insertArticle({ feed_id: catFeedId, title: 'Three', url: 'https://c.example.com/1', published_at: '2026-06-01 00:00:00' })

    const before = Math.floor(Date.now() / 1000) + 60
    const body = await fever('', `&mark=group&as=read&id=${categoryId}&before=${before}`)
    expect(body.unread_item_ids).toBe([articleId, otherArticleId].join(','))
    expect((body.unread_item_ids as string).includes(String(catArticleId))).toBe(false)
  })

  it('reverts recently read items with unread_recently_read', async () => {
    await fever('', `&mark=item&as=read&id=${articleId}`)
    const body = await fever('', '&unread_recently_read=1')
    expect(body.unread_item_ids).toBe([articleId, otherArticleId].join(','))
  })
})

describe('Fever config routes', () => {
  const json = { 'content-type': 'application/json' }

  it('returns the default unconfigured state', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings/fever' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: false, username: '', configured: false })
  })

  it('rejects enabling before credentials are set', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/api/settings/fever', headers: json, payload: { enabled: true } })
    expect(res.statusCode).toBe(400)
  })

  it('rejects a username without a password', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/api/settings/fever', headers: json, payload: { username: 'admin' } })
    expect(res.statusCode).toBe(400)
  })

  it('stores credentials as an md5 hash and never returns the password', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/fever',
      headers: json,
      payload: { username: USERNAME, password: PASSWORD, enabled: true },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ enabled: true, username: USERNAME, configured: true })
    expect(getSetting('fever.api_key_hash')).toBe(API_KEY)

    // Credentials configured through the API authenticate against the endpoint
    const body = await fever('')
    expect(body.auth).toBe(1)
  })

  it('disables without clearing credentials', async () => {
    configureFever()
    const res = await app.inject({ method: 'PATCH', url: '/api/settings/fever', headers: json, payload: { enabled: false } })
    expect(res.json()).toEqual({ enabled: false, username: USERNAME, configured: true })

    const body = await fever('')
    expect(body.auth).toBe(0)
  })
})
