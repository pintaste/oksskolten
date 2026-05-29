import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import {
  getSetting,
  upsertSetting,
  deleteSetting,
  getRetentionStats,
  purgeExpiredArticles,
  getDb,
} from '../db.js'
import { requireJson, getAuthUser } from '../auth.js'
import { getModelValues } from '../../shared/models.js'
import {
  getStoredCustomProviders,
  getCustomProviderModels,
  getCustomProviderConfig,
  CustomApiFormat,
  CUSTOM_PROVIDER_ID_RE,
  PROVIDER_LIST_KEY,
  generateCustomProviderId,
  API_KEY_PREFIX,
  isCustomProviderId,
} from '../providers/llm/custom.js'
import { assertSafeUrl } from '../fetcher/ssrf.js'
import { extractByDotPath } from '../fetcher/article-images.js'
import { getMonthlyUsage } from '../providers/translate/google-translate.js'
import { getDeeplMonthlyUsage } from '../providers/translate/deepl.js'
import { parseOrBadRequest } from '../lib/validation.js'

const ProfileBody = z.object({
  account_name: z.string().optional(),
  avatar_seed: z.string().nullable().optional(),
  language: z.enum(['ja', 'en', 'zh'], { error: 'language must be "ja", "en", or "zh"' }).optional(),
})

const ProviderParams = z.object({ provider: z.string() })
const ApiKeyBody = z.object({ apiKey: z.string().optional() })

const PREF_KEYS = [
  'appearance.color_theme',
  'reading.date_mode',
  'reading.auto_mark_read',
  'reading.unread_indicator',
  'reading.internal_links',
  'reading.show_thumbnails',
  'reading.show_feed_activity',
  'reading.chat_position',
  'reading.article_open_mode',
  'reading.category_unread_only',
  'reading.keyboard_navigation',
  'reading.keybindings',
  'appearance.mascot',
  'appearance.highlight_theme',
  'appearance.font_family',
  'appearance.list_layout',
  'chat.provider',
  'chat.model',
  'summary.provider',
  'summary.model',
  'summary.auto',
  'translate.provider',
  'translate.model',
  'translate.target_lang',
  'translate.source_lang',
  'ollama.base_url',
  'ollama.custom_headers',
  'vllm.base_url',
  'custom_themes',
  'retention.enabled',
  'retention.read_days',
  'retention.unread_days',
  'custom.base_url',
  'custom.name',
  'custom.models',
  'anthropic.base_url',
  'deepseek.base_url',
  'mimo.base_url',
  'openai.base_url',
  'gemini.base_url',
] as const
type PrefKey = typeof PREF_KEYS[number]

const PREF_ALLOWED: Record<PrefKey, string[] | null> = {
  'appearance.color_theme': null,
  'reading.date_mode': ['relative', 'absolute'],
  'reading.auto_mark_read': ['on', 'off'],
  'reading.unread_indicator': ['on', 'off'],
  'reading.internal_links': ['on', 'off'],
  'reading.show_thumbnails': ['on', 'off'],
  'reading.show_feed_activity': ['on', 'off'],
  'reading.chat_position': ['fab', 'inline'],
  'reading.article_open_mode': ['page', 'overlay'],
  'reading.category_unread_only': ['on', 'off'],
  'reading.keyboard_navigation': ['on', 'off'],
  'reading.keybindings': null,
  'appearance.mascot': ['off', 'dream-puff', 'sleepy-giant'],
  'appearance.highlight_theme': null,
  'appearance.font_family': null,
  'appearance.list_layout': ['list', 'card', 'magazine', 'compact'],
  'chat.provider': ['anthropic', 'gemini', 'openai', 'claude-code', 'ollama', 'vllm', 'deepseek', 'mimo', 'custom'],
  'chat.model': null,
  'summary.provider': ['anthropic', 'gemini', 'openai', 'claude-code', 'ollama', 'vllm', 'deepseek', 'mimo', 'custom'],
  'summary.model': null,
  'summary.auto': ['on', 'off'],
  'translate.provider': ['anthropic', 'gemini', 'openai', 'claude-code', 'ollama', 'vllm', 'google-translate', 'deepl', 'deepseek', 'mimo', 'custom'],
  'translate.model': null,
  'translate.target_lang': ['ja', 'en', 'zh'],
  'translate.source_lang': ['ja', 'en', 'zh'],
  'ollama.base_url': null,
  'ollama.custom_headers': null,
  'vllm.base_url': null,
  'custom_themes': null,
  'retention.enabled': ['on', 'off'],
  'retention.read_days': null,
  'retention.unread_days': null,
  'custom.base_url': null,
  'custom.name': null,
  'custom.models': null,
  'anthropic.base_url': null,
  'deepseek.base_url': null,
  'mimo.base_url': null,
  'openai.base_url': null,
  'gemini.base_url': null,
}

const isCustomProviderIdValue = isCustomProviderId

function getCustomProviderApiKeySettingKey(providerId: string): string | null {
  if (providerId === 'custom') return 'api_key.custom'
  if (!CUSTOM_PROVIDER_ID_RE.test(providerId)) return null
  return `${API_KEY_PREFIX}${providerId}`
}

function getAllCustomProvidersForSettings(): Array<{ id: string; name: string; baseUrl: string; models: string[]; apiFormat: CustomApiFormat; configured: boolean }> {
  const providers = getStoredCustomProviders()
  const providerValues = providers.map(provider => ({
    ...provider,
    configured: !!getSetting(getCustomProviderApiKeySettingKey(provider.id) || ''),
  }))
  return providerValues
}

function readStoredCustomProviders(): ReturnType<typeof getStoredCustomProviders> {
  const raw = getSetting(PROVIDER_LIST_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(item => {
        if (!item || typeof item !== 'object') return null
        const candidate = item as { id?: unknown; name?: unknown; baseUrl?: unknown; models?: unknown; apiFormat?: unknown }
        const id = String(candidate.id || '').trim()
        const name = String(candidate.name || '').trim()
        const baseUrl = String(candidate.baseUrl || '').trim()
        const apiFormat = String(candidate.apiFormat || '').trim().toLowerCase()
        if (!id || !name || !baseUrl) return null
        if (id === 'custom' || !CUSTOM_PROVIDER_ID_RE.test(id)) return null
        const models = Array.isArray(candidate.models)
          ? candidate.models
              .map(value => (typeof value === 'string' ? value.trim() : ''))
              .filter((value): value is string => value.length > 0)
          : []
        return { id, name, baseUrl, models, apiFormat: apiFormat === 'anthropic' ? 'anthropic' : 'openai' }
      })
      .filter((item): item is ReturnType<typeof getStoredCustomProviders>[number] => item !== null)
  } catch {
    return []
  }
}

function normalizeCustomModels(models: string[]): string[] {
  const unique = new Set<string>()
  const result: string[] = []
  for (const model of models) {
    const value = String(model || '').trim()
    if (!value || unique.has(value)) continue
    unique.add(value)
    result.push(value)
  }
  return result
}

function persistCustomProviders(providers: ReturnType<typeof readStoredCustomProviders>): void {
  if (providers.length === 0) {
    deleteSetting(PROVIDER_LIST_KEY)
    return
  }
  upsertSetting(PROVIDER_LIST_KEY, JSON.stringify(providers))
}

const PROVIDER_MODEL_PAIRS: Array<{ providerKey: PrefKey; modelKey: PrefKey }> = [
  { providerKey: 'chat.provider', modelKey: 'chat.model' },
  { providerKey: 'summary.provider', modelKey: 'summary.model' },
  { providerKey: 'translate.provider', modelKey: 'translate.model' },
]

function validateProviderModel(body: Record<string, unknown>): string | null {
  for (const { providerKey, modelKey } of PROVIDER_MODEL_PAIRS) {
    const model = body[modelKey] !== undefined ? String(body[modelKey]) : getSetting(modelKey)
    const provider = body[providerKey] !== undefined ? String(body[providerKey]) : getSetting(providerKey)
    if (!model || !provider) continue
    if (isCustomProviderIdValue(provider)) {
      const customModels = getCustomProviderModels(provider)
      if (!customModels.length) {
        return `Custom provider ${provider} has no configured models`
      }
      if (customModels.length > 0 && !customModels.includes(model)) {
        return `Model ${model} is not enabled for provider ${provider}`
      }
      continue
    }
    if (provider === 'custom') {
      const customModels = getCustomProviderModels('custom')
      if (!customModels.length) {
        return 'Custom provider has no configured models'
      }
      if (!customModels.includes(model)) {
        return `Model ${model} is not enabled for provider ${provider}`
      }
      continue
    }
    // google-translate, deepl, ollama, deepseek, and vllm have no static model list
    if (provider === 'google-translate' || provider === 'deepl' || provider === 'ollama' || provider === 'deepseek' || provider === 'vllm') continue
    // claude-code uses anthropic model IDs
    const effectiveProvider = provider === 'claude-code' ? 'anthropic' : provider
    const allowedModels = getModelValues(effectiveProvider)
    if (allowedModels.length > 0 && !allowedModels.includes(model)) {
      return `Model ${model} is not valid for provider ${provider}`
    }
  }
  return null
}

export async function settingsRoutes(api: FastifyInstance): Promise<void> {
  api.get('/api/settings/profile', async (request, reply) => {
    const authEmail = getAuthUser(request) ?? 'localhost'
    let accountName = getSetting('profile.account_name')
    if (!accountName) {
      accountName = authEmail
      upsertSetting('profile.account_name', accountName)
    }
    const avatarSeed = getSetting('profile.avatar_seed') || null
    const language = getSetting('general.language') ?? null
    reply.send({ account_name: accountName, avatar_seed: avatarSeed, language, email: authEmail })
  })

  api.patch(
    '/api/settings/profile',
    { preHandler: [requireJson] },
    async (request, reply) => {
      const body = parseOrBadRequest(ProfileBody, request.body, reply)
      if (!body) return
      if (body.account_name === undefined && body.avatar_seed === undefined && body.language === undefined) {
        reply.status(400).send({ error: 'No fields to update' })
        return
      }
      if (body.account_name !== undefined) {
        const name = body.account_name.trim()
        if (!name) {
          reply.status(400).send({ error: 'account_name must not be empty' })
          return
        }
        upsertSetting('profile.account_name', name)
      }
      if (body.avatar_seed !== undefined) {
        upsertSetting('profile.avatar_seed', body.avatar_seed || '')
      }
      if (body.language !== undefined) {
        upsertSetting('general.language', body.language)
      }
      const accountName = getSetting('profile.account_name')!
      const avatarSeed = getSetting('profile.avatar_seed') || null
      const language = getSetting('general.language') ?? null
      reply.send({ account_name: accountName, avatar_seed: avatarSeed, language })
    },
  )

  // --- Preferences endpoints ---

  api.get('/api/settings/preferences', async (_request, reply) => {
    const result: Record<string, string | null> = {}
    for (const key of PREF_KEYS) {
      result[key] = getSetting(key) ?? null
    }
    reply.send(result)
  })

  const handlePrefsUpdate = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown> // dynamic keys, validated per-field below

    // Validate provider-model consistency before saving
    const validationError = validateProviderModel(body)
    if (validationError) {
      reply.status(400).send({ error: validationError })
      return
    }

    let updated = false
    for (const key of PREF_KEYS) {
      if (body[key] === undefined) continue
      const value = String(body[key])
      if (value === '') {
        deleteSetting(key)
        updated = true
        continue
      }
      // Custom validation for keybindings JSON
      if (key === 'reading.keybindings') {
        try {
          const parsed = JSON.parse(value)
          const validKeys = new Set(['next', 'prev', 'bookmark', 'openExternal'])
          const keys = Object.keys(parsed)
          if (keys.length !== 4 || !keys.every(k => validKeys.has(k))) {
            reply.status(400).send({ error: 'Invalid keybindings: keys must be next, prev, bookmark, openExternal' })
            return
          }
          const PRINTABLE_RE = /^[!-~]$/
          const vals = Object.values(parsed) as string[]
          if (!vals.every(v => typeof v === 'string' && PRINTABLE_RE.test(v))) {
            reply.status(400).send({ error: 'Invalid keybindings: values must be single printable ASCII characters' })
            return
          }
          if (new Set(vals).size !== vals.length) {
            reply.status(400).send({ error: 'Invalid keybindings: duplicate key assignments are not allowed' })
            return
          }
        } catch {
          reply.status(400).send({ error: 'Invalid keybindings: must be valid JSON' })
          return
        }
        upsertSetting(key, value)
        updated = true
        continue
      }
      const allowed = PREF_ALLOWED[key]
      if (key.endsWith('.provider') && allowed) {
        if (!allowed.includes(value) && isCustomProviderIdValue(value)) {
          if (!getCustomProviderConfig(value)) {
            reply.status(400).send({ error: `Invalid value for ${key}` })
            return
          }
        } else if (!allowed.includes(value) && key === 'translate.provider' && !value.startsWith('google-translate') && !value.startsWith('deepl')) {
          // keep legacy behavior for translate providers; this branch remains strict for known providers
          reply.status(400).send({ error: `Invalid value for ${key}` })
          return
        } else if (!allowed.includes(value) && !isCustomProviderIdValue(value)) {
          reply.status(400).send({ error: `Invalid value for ${key}` })
          return
        }
      }
      if (allowed && !allowed.includes(value)) {
        // Skip static model list check when provider is ollama or vllm (dynamic models)
        const modelKeyPair = PROVIDER_MODEL_PAIRS.find(p => p.modelKey === key)
      if (modelKeyPair) {
          const provider = body[modelKeyPair.providerKey] !== undefined
            ? String(body[modelKeyPair.providerKey])
            : getSetting(modelKeyPair.providerKey)
          if (
            provider === 'ollama'
            || provider === 'vllm'
            || provider === 'deepseek'
            || provider === 'mimo'
            || provider === 'custom'
            || isCustomProviderIdValue(provider || '')
          ) {
            upsertSetting(key, value)
            updated = true
            continue
          }
        }

        reply.status(400).send({ error: `Invalid value for ${key}` })
        return
      }
      // Validate retention days: must be a positive integer
      if (key === 'retention.read_days' || key === 'retention.unread_days') {
        const parsed = z.coerce.number().int().min(1).max(9999).safeParse(value)
        if (!parsed.success) {
          reply.status(400).send({ error: `${key} must be a positive integer (1-9999)` })
          return
        }
      }
      upsertSetting(key, value)
      updated = true
    }
    if (!updated) {
      reply.status(400).send({ error: 'No valid fields to update' })
      return
    }
    const result: Record<string, string | null> = {}
    for (const key of PREF_KEYS) {
      result[key] = getSetting(key) ?? null
    }
    reply.send(result)
  }

  api.patch('/api/settings/preferences', { preHandler: [requireJson] }, handlePrefsUpdate)
  api.post('/api/settings/preferences', { preHandler: [requireJson] }, handlePrefsUpdate)

  // --- Image storage settings ---

  api.get('/api/settings/image-storage', async (_request, reply) => {
    const enabled = getSetting('images.enabled') ?? null
    const mode = getSetting('images.storage') ?? 'local'
    const storagePath = getSetting('images.storage_path') ?? null
    const maxSizeMb = getSetting('images.max_size_mb') ?? null
    const url = getSetting('images.upload_url') ?? ''
    const headersRaw = getSetting('images.upload_headers')
    const fieldName = getSetting('images.upload_field') ?? 'image'
    const respPath = getSetting('images.upload_resp_path') ?? ''
    const healthcheckUrl = getSetting('images.healthcheck_url') ?? ''
    reply.send({
      'images.enabled': enabled,
      mode,
      url,
      headersConfigured: !!headersRaw,
      fieldName,
      respPath,
      healthcheckUrl,
      'images.storage_path': storagePath,
      'images.max_size_mb': maxSizeMb,
    })
  })

  api.patch(
    '/api/settings/image-storage',
    { preHandler: [requireJson] },
    async (request, reply) => {
      const body = request.body as Record<string, unknown> // dynamic keys, validated per-field below

      // Simple keys
      if (body['images.enabled'] !== undefined) {
        const val = String(body['images.enabled'])
        if (val === '') deleteSetting('images.enabled')
        else upsertSetting('images.enabled', val)
      }
      if (body['images.storage_path'] !== undefined) {
        const val = String(body['images.storage_path']).trim()
        if (val === '') deleteSetting('images.storage_path')
        else upsertSetting('images.storage_path', val)
      }
      if (body['images.max_size_mb'] !== undefined) {
        const val = String(body['images.max_size_mb']).trim()
        if (val === '') {
          deleteSetting('images.max_size_mb')
        } else {
          const num = Number(val)
          if (isNaN(num) || num <= 0 || num > 100) {
            reply.status(400).send({ error: 'max_size_mb must be 1-100' })
            return
          }
          upsertSetting('images.max_size_mb', val)
        }
      }

      // Remote upload keys
      if (body.mode !== undefined) {
        const mode = String(body.mode)
        if (mode !== 'local' && mode !== 'remote') {
          reply.status(400).send({ error: 'mode must be "local" or "remote"' })
          return
        }
        upsertSetting('images.storage', mode)
      }
      if (body.url !== undefined) {
        const urlVal = String(body.url).trim()
        if (urlVal) {
          try {
            await assertSafeUrl(urlVal)
          } catch {
            reply.status(400).send({ error: 'Invalid or blocked URL' })
            return
          }
          upsertSetting('images.upload_url', urlVal)
        } else {
          deleteSetting('images.upload_url')
        }
      }
      if (body.headers !== undefined) {
        const headersVal = String(body.headers).trim()
        if (headersVal === '') {
          deleteSetting('images.upload_headers')
        } else {
          try {
            const parsed = JSON.parse(headersVal)
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
              throw new Error('not an object')
            }
            upsertSetting('images.upload_headers', headersVal)
          } catch {
            reply.status(400).send({ error: 'headers must be valid JSON object' })
            return
          }
        }
      }
      if (body.fieldName !== undefined) {
        const fieldVal = String(body.fieldName).trim()
        if (fieldVal) upsertSetting('images.upload_field', fieldVal)
        else deleteSetting('images.upload_field')
      }
      if (body.respPath !== undefined) {
        const pathVal = String(body.respPath).trim()
        if (pathVal) upsertSetting('images.upload_resp_path', pathVal)
        else deleteSetting('images.upload_resp_path')
      }
      if (body.healthcheckUrl !== undefined) {
        const hcVal = String(body.healthcheckUrl).trim()
        if (hcVal) {
          try {
            await assertSafeUrl(hcVal)
          } catch {
            reply.status(400).send({ error: 'Invalid or blocked healthcheck URL' })
            return
          }
          upsertSetting('images.healthcheck_url', hcVal)
        } else {
          deleteSetting('images.healthcheck_url')
        }
      }

      // Return current state
      const enabled = getSetting('images.enabled') ?? null
      const mode = getSetting('images.storage') ?? 'local'
      const storagePath = getSetting('images.storage_path') ?? null
      const maxSizeMb = getSetting('images.max_size_mb') ?? null
      const url = getSetting('images.upload_url') ?? ''
      const headersRaw = getSetting('images.upload_headers')
      const fieldName = getSetting('images.upload_field') ?? 'image'
      const respPath = getSetting('images.upload_resp_path') ?? ''
      const healthcheckUrl = getSetting('images.healthcheck_url') ?? ''
      reply.send({
        'images.enabled': enabled,
        mode,
        url,
        headersConfigured: !!headersRaw,
        fieldName,
        respPath,
        healthcheckUrl,
        'images.storage_path': storagePath,
        'images.max_size_mb': maxSizeMb,
      })
    },
  )

  // --- Image storage test upload ---

  api.post('/api/settings/image-storage/test', async (_request, reply) => {
    const mode = getSetting('images.storage')
    if (mode !== 'remote') {
      reply.status(400).send({ error: 'Image storage mode is not set to remote' })
      return
    }

    const uploadUrl = getSetting('images.upload_url')
    const headersRaw = getSetting('images.upload_headers')
    const fieldName = getSetting('images.upload_field') ?? 'image'
    const respPath = getSetting('images.upload_resp_path')

    if (!uploadUrl || !respPath) {
      reply.status(400).send({ error: 'Remote upload settings are incomplete' })
      return
    }

    try {
      await assertSafeUrl(uploadUrl)
    } catch {
      reply.status(400).send({ error: 'Upload URL is blocked by SSRF protection' })
      return
    }

    // Generate 1x1 transparent PNG
    const png1x1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
      'Nl7BcQAAAABJRU5ErkJggg==',
      'base64',
    )

    let headers: Record<string, string> = {}
    if (headersRaw) {
      try {
        headers = JSON.parse(headersRaw)
      } catch {
        reply.status(400).send({ error: 'Stored headers are invalid JSON' })
        return
      }
    }

    try {
      const formData = new FormData()
      formData.append(fieldName, new Blob([png1x1], { type: 'image/png' }), 'test.png')

      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers,
        body: formData,
        signal: AbortSignal.timeout(15_000),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        reply.status(400).send({ error: `Upload failed: ${res.status} ${text.slice(0, 200)}` })
        return
      }

      const json = await res.json()
      const extractedUrl = extractByDotPath(json, respPath)
      if (!extractedUrl || typeof extractedUrl !== 'string') {
        reply.status(400).send({ error: `Could not extract URL from response at path "${respPath}"` })
        return
      }

      reply.send({ success: true, url: extractedUrl })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      reply.status(400).send({ error: `Test upload failed: ${message}` })
    }
  })

  // --- Image storage healthcheck ---

  api.post('/api/settings/image-storage/healthcheck', async (_request, reply) => {
    const healthcheckUrl = getSetting('images.healthcheck_url')
    if (!healthcheckUrl) {
      reply.status(400).send({ error: 'Healthcheck URL is not configured' })
      return
    }

    try {
      await assertSafeUrl(healthcheckUrl)
    } catch {
      reply.status(400).send({ error: 'Healthcheck URL is blocked by SSRF protection' })
      return
    }

    try {
      const res = await fetch(healthcheckUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(10_000),
      })

      if (res.ok) {
        reply.send({ success: true, status: res.status })
      } else {
        reply.status(502).send({ error: `Unhealthy: ${res.status} ${res.statusText}` })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      reply.status(502).send({ error: `Healthcheck failed: ${message}` })
    }
  })

  // --- Retention policy ---

  function getRetentionDays(): { readDays: number; unreadDays: number } | null {
    const readDays = Number(getSetting('retention.read_days'))
    const unreadDays = Number(getSetting('retention.unread_days'))
    if (isNaN(readDays) || isNaN(unreadDays) || readDays < 1 || unreadDays < 1) return null
    return { readDays, unreadDays }
  }

  api.get('/api/settings/retention/stats', async (_request, reply) => {
    const days = getRetentionDays()
    if (!days) {
      reply.send({ readDays: 0, unreadDays: 0, readEligible: 0, unreadEligible: 0 })
      return
    }
    const stats = getRetentionStats(days.readDays, days.unreadDays)
    reply.send({ readDays: days.readDays, unreadDays: days.unreadDays, ...stats })
  })

  api.post('/api/settings/retention/purge', async (_request, reply) => {
    if (getSetting('retention.enabled') !== 'on') {
      reply.status(400).send({ error: 'Retention policy is not enabled' })
      return
    }
    const days = getRetentionDays()
    if (!days) {
      reply.send({ purged: 0 })
      return
    }
    const result = purgeExpiredArticles(days.readDays, days.unreadDays)

    // Checkpoint WAL after purge
    try {
      getDb().exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch {
      // non-critical
    }

    reply.send(result)
  })

  // --- Provider API key management ---

  const PROVIDER_KEY_MAP: Record<string, string> = {
    anthropic: 'api_key.anthropic',
    gemini: 'api_key.gemini',
    openai: 'api_key.openai',
    vllm: 'api_key.vllm',
    'google-translate': 'api_key.google_translate',
    deepl: 'api_key.deepl',
    deepseek: 'api_key.deepseek',
    mimo: 'api_key.mimo',
  }

  function resolveProviderApiKeySetting(provider: string): string | null {
    if (isCustomProviderIdValue(provider)) {
      return getCustomProviderApiKeySettingKey(provider)
    }
    return PROVIDER_KEY_MAP[provider] || null
  }

  api.get('/api/settings/api-keys/:provider', async (request, reply) => {
    const { provider } = ProviderParams.parse(request.params)
    const settingKey = resolveProviderApiKeySetting(provider)
    if (!settingKey) {
      reply.status(400).send({ error: `Unknown provider: ${provider}` })
      return
    }
    reply.send({ configured: !!getSetting(settingKey) })
  })

  api.post('/api/settings/api-keys/:provider', { preHandler: [requireJson] }, async (request, reply) => {
    const { provider } = ProviderParams.parse(request.params)
    const settingKey = resolveProviderApiKeySetting(provider)
    if (!settingKey) {
      reply.status(400).send({ error: `Unknown provider: ${provider}` })
      return
    }
    const { apiKey } = ApiKeyBody.parse(request.body)
    if (!apiKey || apiKey.trim() === '') {
      deleteSetting(settingKey)
      reply.send({ ok: true, configured: false })
    } else {
      upsertSetting(settingKey, apiKey.trim())
      reply.send({ ok: true, configured: true })
    }
  })

  // --- Translation provider usage ---

  api.get('/api/settings/google-translate/usage', async (_request, reply) => {
    reply.send(getMonthlyUsage())
  })

  api.get('/api/settings/deepl/usage', async (_request, reply) => {
    reply.send(getDeeplMonthlyUsage())
  })

  // --- Ollama endpoints ---

  async function ollamaFetch(path: string): Promise<Response> {
    const { getOllamaBaseUrl, getOllamaCustomHeaders } = await import('../providers/llm/ollama.js')
    const baseUrl = getOllamaBaseUrl().replace(/\/+$/, '')
    const headers = getOllamaCustomHeaders()
    return fetch(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(5_000) })
  }

  api.get('/api/settings/ollama/models', async (_request, reply) => {
    try {
      const res = await ollamaFetch('/api/tags')
      if (!res.ok) {
        reply.send({ models: [] })
        return
      }
      const data = await res.json() as { models?: Array<{ name: string; size: number; details?: { parameter_size?: string } }> }
      const models = (data.models || []).map(m => ({
        name: m.name,
        size: m.size,
        parameter_size: m.details?.parameter_size || '',
      }))
      reply.send({ models })
    } catch {
      reply.send({ models: [] })
    }
  })

  api.get('/api/settings/ollama/status', async (_request, reply) => {
    try {
      const [versionRes, tagsRes] = await Promise.all([
        ollamaFetch('/api/version'),
        ollamaFetch('/api/tags'),
      ])
      if (!versionRes.ok || !tagsRes.ok) {
        reply.send({ ok: false, error: `HTTP ${versionRes.status}` })
        return
      }
      const versionData = await versionRes.json() as { version?: string }
      const tagsData = await tagsRes.json() as { models?: unknown[] }
      reply.send({
        ok: true,
        version: versionData.version || 'unknown',
        model_count: tagsData.models?.length || 0,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      reply.send({ ok: false, error: message })
    }
  })

  // --- vLLM endpoints ---

  async function vllmFetch(path: string): Promise<Response> {
    const { getVllmBaseUrl, getVllmApiKey } = await import('../providers/llm/vllm.js')
    const baseUrl = getVllmBaseUrl().replace(/\/+$/, '')
    const apiKey = getVllmApiKey()
    const headers: Record<string, string> = {}
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    return fetch(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(5_000) })
  }

  api.get('/api/settings/vllm/models', async (_request, reply) => {
    try {
      const res = await vllmFetch('/v1/models')
      if (!res.ok) {
        reply.send({ models: [] })
        return
      }
      const data = await res.json() as { data?: Array<{ id: string }> }
      const models = (data.data || []).map(m => ({
        name: m.id,
      }))
      reply.send({ models })
    } catch {
      reply.send({ models: [] })
    }
  })

  api.get('/api/settings/vllm/status', async (_request, reply) => {
    try {
      const res = await vllmFetch('/v1/models')
      if (!res.ok) {
        reply.send({ ok: false, error: `HTTP ${res.status}` })
        return
      }
      const data = await res.json() as { data?: unknown[] }
      reply.send({
        ok: true,
        model_count: data.data?.length || 0,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      reply.send({ ok: false, error: message })
    }
  })

  // --- DeepSeek endpoints ---

  async function deepseekFetch(path: string): Promise<Response> {
    const { getDeepSeekApiKey, getDeepSeekBaseUrl } = await import('../providers/llm/deepseek.js')
    const apiKey = getDeepSeekApiKey()
    const baseUrl = getDeepSeekBaseUrl().replace(/\/+$/, '').replace(/\/v1$/, '')
    const headers: Record<string, string> = {}
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    return fetch(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(10_000) })
  }

  function isLikelyDeepSeekApiKey(apiKey: string): boolean {
    return /^sk-[A-Za-z0-9_-]{10,}$/.test(apiKey)
  }

  api.get('/api/settings/deepseek/models', async (_request, reply) => {
    try {
      const res = await deepseekFetch('/v1/models')
      if (!res.ok) {
        reply.send({ models: [] })
        return
      }
      const data = await res.json() as { data?: Array<{ id: string }> }
      const models = (data.data || []).map(m => ({ name: m.id }))
      reply.send({ models })
    } catch {
      reply.send({ models: [] })
    }
  })

  api.get('/api/settings/deepseek/status', async (_request, reply) => {
    try {
      const { getDeepSeekApiKey } = await import('../providers/llm/deepseek.js')
      const apiKey = getDeepSeekApiKey()
      if (!apiKey) {
        reply.send({ ok: false, error: 'API key not configured' })
        return
      }
      if (!isLikelyDeepSeekApiKey(apiKey)) {
        reply.send({ ok: false, error: 'Invalid DeepSeek API key format' })
        return
      }

      const res = await deepseekFetch('/v1/models')
      if (!res.ok) {
        reply.send({ ok: false, error: `HTTP ${res.status}` })
        return
      }
      const data = await res.json() as { data?: unknown[] }
      if (!Array.isArray(data.data)) {
        reply.send({ ok: false, error: 'Unexpected DeepSeek response format' })
        return
      }
      reply.send({ ok: true, model_count: data.data?.length || 0 })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      reply.send({ ok: false, error: message })
    }
  })

  // --- Mimo endpoints ---

  async function mimoFetch(path: string): Promise<Response> {
    const { getMimoApiKey, getMimoBaseUrl } = await import('../providers/llm/mimo.js')
    const apiKey = getMimoApiKey()
    const baseUrl = getMimoBaseUrl().replace(/\/+$/, '').replace(/\/v1$/, '')
    const headers: Record<string, string> = {}
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    return fetch(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(10_000) })
  }

  api.get('/api/settings/mimo/models', async (_request, reply) => {
    try {
      const res = await mimoFetch('/v1/models')
      if (!res.ok) {
        reply.send({ models: [] })
        return
      }
      const data = await res.json() as { data?: Array<{ id: string }> }
      const models = (data.data || []).map(m => ({ name: m.id }))
      reply.send({ models })
    } catch {
      reply.send({ models: [] })
    }
  })

  api.get('/api/settings/mimo/status', async (_request, reply) => {
    try {
      const res = await mimoFetch('/v1/models')
      if (!res.ok) {
        reply.send({ ok: false, error: `HTTP ${res.status}` })
        return
      }
      const data = await res.json() as { data?: unknown[] }
      reply.send({ ok: true, model_count: data.data?.length || 0 })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      reply.send({ ok: false, error: message })
    }
  })

  // --- Custom provider registry endpoints ---

  const CustomProviderPayload = z.object({
    providerId: z.string().optional().nullable(),
    name: z.string().trim().min(1),
    baseUrl: z.string().trim().min(1),
    apiKey: z.string().optional(),
    apiFormat: z.enum(['openai', 'anthropic']).optional(),
    models: z.array(z.string().trim().min(1)).min(1),
  })

  const CustomProviderParams = z.object({ providerId: z.string() })

  api.get('/api/settings/custom-providers', async (_request, reply) => {
    const providers = getAllCustomProvidersForSettings()
    reply.send({ providers })
  })

  api.post('/api/settings/custom-providers', { preHandler: [requireJson] }, async (request, reply) => {
    const body = parseOrBadRequest(CustomProviderPayload, request.body, reply)
    if (!body) return

    const { providerId, name, baseUrl, apiKey, apiFormat, models: rawModels } = body
    const models = normalizeCustomModels(rawModels)
    if (!models.length) {
      reply.status(400).send({ error: 'At least one model is required' })
      return
    }

    try {
      await assertSafeUrl(baseUrl)
    } catch {
      reply.status(400).send({ error: 'Invalid or blocked URL' })
      return
    }

    const persisted = readStoredCustomProviders()
    const nextProviderId = providerId?.trim() || generateCustomProviderId()
    const isExisting = persisted.some(item => item.id === nextProviderId)

    if (providerId && !isCustomProviderIdValue(providerId)) {
      reply.status(400).send({ error: `Invalid providerId: ${providerId}` })
      return
    }
    if (providerId && !isExisting && nextProviderId === 'custom') {
      reply.status(400).send({ error: 'custom is reserved for legacy provider' })
      return
    }

    const resolvedApiFormat = apiFormat || 'openai'
    const list = isExisting
      ? persisted.map(item => (item.id === nextProviderId ? { ...item, name, baseUrl, apiFormat: resolvedApiFormat, models } : item))
      : [...persisted, { id: nextProviderId, name, baseUrl, apiFormat: resolvedApiFormat, models }]

    persistCustomProviders(list)
    const settingKey = getCustomProviderApiKeySettingKey(nextProviderId)
    if (!settingKey) {
      reply.status(500).send({ error: 'Unable to resolve provider key' })
      return
    }
    if (apiKey && apiKey.trim()) {
      upsertSetting(settingKey, apiKey.trim())
    } else if (!isExisting) {
      deleteSetting(settingKey)
    }

    reply.send({ provider: { ...list.find(item => item.id === nextProviderId)! }, configured: !!getSetting(settingKey) })
  })

  api.delete('/api/settings/custom-providers/:providerId', async (request, reply) => {
    const { providerId } = CustomProviderParams.parse(request.params)
    if (!isCustomProviderIdValue(providerId)) {
      reply.status(400).send({ error: `Invalid providerId: ${providerId}` })
      return
    }

    if (providerId === 'custom') {
      deleteSetting('custom.base_url')
      deleteSetting('custom.name')
      deleteSetting('custom.models')
      deleteSetting('api_key.custom')
      deleteSetting(PROVIDER_LIST_KEY)
      reply.send({ ok: true })
      return
    }

    const persisted = readStoredCustomProviders()
    const next = persisted.filter(item => item.id !== providerId)
    if (next.length === persisted.length) {
      reply.status(404).send({ error: `Provider not found: ${providerId}` })
      return
    }
    const settingKey = getCustomProviderApiKeySettingKey(providerId)
    if (settingKey) deleteSetting(settingKey)
    persistCustomProviders(next)
    reply.send({ ok: true })
  })

  api.get('/api/settings/custom-providers/:providerId/status', async (request, reply) => {
    const { providerId } = CustomProviderParams.parse(request.params)
    if (!isCustomProviderIdValue(providerId)) {
      reply.status(400).send({ error: `Invalid providerId: ${providerId}` })
      return
    }
    if (providerId === 'custom') {
      try {
        const res = await customFetch('/v1/models')
        if (!res.ok) {
          reply.send({ ok: false, error: `HTTP ${res.status}` })
          return
        }
        const data = await res.json() as { data?: unknown[] }
        reply.send({ ok: true, model_count: data.data?.length || 0 })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Connection failed'
        reply.send({ ok: false, error: message })
      }
      return
    }
    const config = getCustomProviderConfig(providerId)
    if (!config) {
      reply.status(404).send({ error: `Provider not found: ${providerId}` })
      return
    }
    const apiKey = getSetting(getCustomProviderApiKeySettingKey(providerId) || '')
    try {
      const res = await customFetchWithConfig(config.baseUrl, apiKey || '', '/v1/models', config.apiFormat)
      if (!res.ok) {
        reply.send({ ok: false, error: `HTTP ${res.status}` })
        return
      }
      const data = await res.json() as { data?: unknown[] }
      reply.send({ ok: true, model_count: data.data?.length || 0 })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      reply.send({ ok: false, error: message })
    }
  })

  async function customFetch(path: string): Promise<Response> {
    const { getCustomBaseUrl, getCustomProviderApiKey } = await import('../providers/llm/custom.js')
    const baseUrl = getCustomBaseUrl()
    if (!baseUrl) throw new Error('CUSTOM_BASE_URL_NOT_SET')
    const apiKey = getCustomProviderApiKey()
    return customFetchWithConfig(baseUrl, apiKey, path, 'openai')
  }

  async function customFetchWithConfig(baseUrl: string, apiKey: string, path: string, apiFormat: 'openai' | 'anthropic' = 'openai'): Promise<Response> {
    const headers: Record<string, string> = {}
    if (apiFormat === 'anthropic') {
      if (apiKey) headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '')
    return fetch(`${normalizedBaseUrl}${path}`, { headers, signal: AbortSignal.timeout(10_000) })
  }

  const CustomModelsPreviewBody = z.object({
    baseUrl: z.string().min(1),
    providerId: z.string().optional().nullable(),
    apiKey: z.string().optional(),
    apiFormat: z.enum(['openai', 'anthropic']).optional(),
  })

  api.get('/api/settings/custom/models', async (_request, reply) => {
    try {
      const res = await customFetch('/v1/models')
      if (!res.ok) {
        reply.send({ models: [] })
        return
      }
      const data = await res.json() as { data?: Array<{ id: string }>; models?: Array<{ id: string } | string> }
      const rawModels = data.data?.length ? data.data : (data.models || [])
      const models = rawModels.map(item => {
        if (typeof item === 'string') return { name: item }
        return { name: item.id }
      }).filter(m => !!m.name)
      reply.send({ models })
    } catch {
      reply.send({ models: [] })
    }
  })

  api.post('/api/settings/custom/models/preview', { preHandler: [requireJson] }, async (request, reply) => {
    const body = parseOrBadRequest(CustomModelsPreviewBody, request.body, reply)
    if (!body) return
    const providerId = (body.providerId || '').trim()
    const fallbackApiKey = providerId
      ? getSetting(getCustomProviderApiKeySettingKey(providerId) || '')
      : ''
    const apiKey = body.apiKey || fallbackApiKey || ''
    try {
      const res = await customFetchWithConfig(body.baseUrl, apiKey, '/v1/models', body.apiFormat || 'openai')
      if (!res.ok) {
        reply.send({ models: [] })
        return
      }
      const data = await res.json() as { data?: Array<{ id: string }>; models?: Array<{ id: string } | string> }
      const rawModels = data.data?.length ? data.data : (data.models || [])
      const models = rawModels.map(item => {
        if (typeof item === 'string') return { name: item }
        return { name: item.id }
      }).filter(m => !!m.name)
      reply.send({ models })
    } catch {
      reply.send({ models: [] })
    }
  })

  api.get('/api/settings/custom/status', async (_request, reply) => {
    try {
      const res = await customFetch('/v1/models')
      if (!res.ok) {
        reply.send({ ok: false, error: `HTTP ${res.status}` })
        return
      }
      const data = await res.json() as { data?: unknown[] }
      reply.send({ ok: true, model_count: data.data?.length || 0 })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      reply.send({ ok: false, error: message })
    }
  })

  // --- Anthropic status endpoint ---

  async function anthropicFetch(path: string): Promise<Response> {
    const key = getSetting('api_key.anthropic') || ''
    const baseUrl = (getSetting('anthropic.base_url') || 'https://api.anthropic.com')
      .replace(/\/+$/, '')
      .replace(/\/v1$/, '')
    return fetch(`${baseUrl}${path}`, {
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(10_000),
    })
  }

  function isLikelyAnthropicApiKey(apiKey: string): boolean {
    return /^sk-ant-[A-Za-z0-9_-]{10,}$/.test(apiKey)
  }

  api.get('/api/settings/anthropic/status', async (_request, reply) => {
    const key = getSetting('api_key.anthropic')
    if (!key) {
      reply.send({ ok: false, error: 'API key not configured' })
      return
    }
    if (!isLikelyAnthropicApiKey(key)) {
      reply.send({ ok: false, error: 'Invalid Anthropic API key format' })
      return
    }
    try {
      const res = await anthropicFetch('/v1/models')
      if (!res.ok) {
        reply.send({ ok: false, error: `HTTP ${res.status}` })
        return
      }
      const data = await res.json() as { data?: unknown[] }
      if (!Array.isArray(data.data)) {
        reply.send({ ok: false, error: 'Unexpected Anthropic response format' })
        return
      }
      reply.send({ ok: true, model_count: data.data?.length || 0 })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      reply.send({ ok: false, error: message })
    }
  })

  // --- OpenAI status endpoint ---

  async function openaiFetch(path: string): Promise<Response> {
    const { getOpenAIBaseUrl } = await import('../providers/llm/openai.js')
    const apiKey = getSetting('api_key.openai') || ''
    const baseUrl = getOpenAIBaseUrl().replace(/\/+$/, '').replace(/\/v1$/, '')
    const headers: Record<string, string> = {}
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    return fetch(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(10_000) })
  }

  api.get('/api/settings/openai/status', async (_request, reply) => {
    try {
      const res = await openaiFetch('/v1/models')
      if (!res.ok) {
        reply.send({ ok: false, error: `HTTP ${res.status}` })
        return
      }
      const data = await res.json() as { data?: unknown[] }
      reply.send({ ok: true, model_count: data.data?.length || 0 })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      reply.send({ ok: false, error: message })
    }
  })

  // --- Gemini status endpoint ---

  async function geminiFetch(path: string): Promise<Response> {
    const key = getSetting('api_key.gemini') || ''
    const baseUrl = (getSetting('gemini.base_url') || 'https://generativelanguage.googleapis.com')
      .replace(/\/+$/, '')
      .replace(/\/v1beta$/, '')
      .replace(/\/v1$/, '')
    const url = new URL(`${baseUrl}${path}`)
    url.searchParams.set('key', key)
    return fetch(url, { signal: AbortSignal.timeout(10_000) })
  }

  api.get('/api/settings/gemini/status', async (_request, reply) => {
    const key = getSetting('api_key.gemini')
    if (!key) {
      reply.send({ ok: false, error: 'API key not configured' })
      return
    }
    try {
      const res = await geminiFetch('/v1beta/models')
      if (!res.ok) {
        reply.send({ ok: false, error: `HTTP ${res.status}` })
        return
      }
      const data = await res.json() as { models?: unknown[] }
      reply.send({ ok: true, model_count: data.models?.length || 0 })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      reply.send({ ok: false, error: message })
    }
  })

  // --- Google Translate status endpoint ---

  async function googleTranslateFetch(path: string): Promise<Response> {
    const key = getSetting('api_key.google_translate') || ''
    const url = new URL(`https://translation.googleapis.com${path}`)
    url.searchParams.set('key', key)
    return fetch(url, { signal: AbortSignal.timeout(10_000) })
  }

  api.get('/api/settings/google-translate/status', async (_request, reply) => {
    const key = getSetting('api_key.google_translate')
    if (!key) {
      reply.send({ ok: false, error: 'API key not configured' })
      return
    }
    try {
      const res = await googleTranslateFetch('/language/translate/v2/languages')
      if (!res.ok) {
        reply.send({ ok: false, error: `HTTP ${res.status}` })
        return
      }
      const data = await res.json() as { data?: { languages?: unknown[] } }
      reply.send({ ok: true, language_count: data.data?.languages?.length || 0 })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      reply.send({ ok: false, error: message })
    }
  })

  // --- DeepL status endpoint ---

  async function deeplFetch(path: string): Promise<Response> {
    const key = getSetting('api_key.deepl') || ''
    const baseUrl = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'
    return fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `DeepL-Auth-Key ${key}` },
      signal: AbortSignal.timeout(10_000),
    })
  }

  api.get('/api/settings/deepl/status', async (_request, reply) => {
    const key = getSetting('api_key.deepl')
    if (!key) {
      reply.send({ ok: false, error: 'API key not configured' })
      return
    }
    try {
      const res = await deeplFetch('/v2/usage')
      if (!res.ok) {
        reply.send({ ok: false, error: `HTTP ${res.status}` })
        return
      }
      reply.send({ ok: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      reply.send({ ok: false, error: message })
    }
  })
}
