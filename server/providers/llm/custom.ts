import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { getSetting } from '../../db.js'
import type { LLMProvider, LLMMessageParams, LLMStreamResult } from './provider.js'

export type CustomApiFormat = 'openai' | 'anthropic'

export interface StoredCustomProvider {
  id: string
  name: string
  baseUrl: string
  models: string[]
  apiFormat: CustomApiFormat
}

export const PROVIDER_LIST_KEY = 'custom.providers'
export const CUSTOM_PROVIDER_ID_RE = /^custom-[A-Za-z0-9-]+$/

const LEGACY_PROVIDER_ID = 'custom'
const API_KEY_PREFIX = 'api_key.custom-'
const LEGACY_BASE_URL_KEY = 'custom.base_url'
const LEGACY_NAME_KEY = 'custom.name'
const LEGACY_MODELS_KEY = 'custom.models'
const LEGACY_API_KEY = 'api_key.custom'

const DEFAULT_NAME = 'Custom API'
const DEFAULT_API_FORMAT: CustomApiFormat = 'openai'
const FOLDER_TAG = 'custom-'

type ClientCache = {
  baseUrl: string
  apiKey: string
  client: OpenAI
}

type AnthropicClientCache = {
  baseUrl: string
  apiKey: string
  client: Anthropic
}

const clientCache = new Map<string, ClientCache>()
const anthropicClientCache = new Map<string, AnthropicClientCache>()

function toModelList(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(item => item.length > 0)
  }
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return []
    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) return []
      return parsed
        .map(item => (typeof item === 'string' ? item.trim() : ''))
        .filter(item => item.length > 0)
    } catch {
      return []
    }
  }
  return []
}

function parseCustomProvider(raw: unknown): StoredCustomProvider | null {
  if (!raw || typeof raw !== 'object') return null
  const id = String((raw as { id?: unknown }).id || '').trim()
  const name = String((raw as { name?: unknown }).name || '').trim()
  const baseUrl = String((raw as { baseUrl?: unknown }).baseUrl || '').trim()
  if (!name || !baseUrl) return null
  if (id !== LEGACY_PROVIDER_ID && !CUSTOM_PROVIDER_ID_RE.test(id)) return null
  const apiFormat = String((raw as { apiFormat?: unknown }).apiFormat || '').trim().toLowerCase()
  return {
    id,
    name,
    baseUrl,
    apiFormat: apiFormat === 'anthropic' ? 'anthropic' : DEFAULT_API_FORMAT,
    models: toModelList((raw as { models?: unknown }).models),
  }
}

function parseCustomProviders(raw: string | null | undefined): StoredCustomProvider[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const providers: StoredCustomProvider[] = []
    for (const item of parsed) {
      const provider = parseCustomProvider(item)
      if (provider) providers.push(provider)
    }
    return providers
  } catch {
    return []
  }
}

function getStoredRawProviders(): StoredCustomProvider[] {
  return parseCustomProviders(getSetting(PROVIDER_LIST_KEY))
}

function normalizeProviderId(id: string): string {
  return (id || '').trim().replace(/\s+/g, '-')
}

export function generateCustomProviderId(): string {
  const seed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${FOLDER_TAG}${normalizeProviderId(seed)}`
}

export function getLegacyCustomProvider(): StoredCustomProvider | null {
  const baseUrl = getSetting(LEGACY_BASE_URL_KEY)
  if (!baseUrl) return null
  return {
    id: LEGACY_PROVIDER_ID,
    name: getSetting(LEGACY_NAME_KEY)?.trim() || DEFAULT_NAME,
    baseUrl,
    apiFormat: DEFAULT_API_FORMAT,
    models: toModelList(getSetting(LEGACY_MODELS_KEY)),
  }
}

export function getStoredCustomProviders(): StoredCustomProvider[] {
  const stored = getStoredRawProviders()
  if (stored.length > 0) return stored
  const legacy = getLegacyCustomProvider()
  if (!legacy) return []
  return [legacy]
}

export function getCustomProviderConfig(providerId: string): StoredCustomProvider | null {
  if (!providerId) return null
  const providers = getStoredCustomProviders()
  if (providerId === LEGACY_PROVIDER_ID) return providers[0] || null
  return providers.find(provider => provider.id === providerId) || null
}

export function resolveCustomProviderId(providerId: string): string | null {
  if (!providerId) return null
  if (providerId === LEGACY_PROVIDER_ID) {
    return getStoredCustomProviders()[0]?.id || null
  }
  if (CUSTOM_PROVIDER_ID_RE.test(providerId)) {
    return getCustomProviderConfig(providerId) ? providerId : null
  }
  return null
}

export function getCustomProviderModels(providerId: string): string[] {
  const resolved = providerId === 'custom' ? getStoredCustomProviders()[0]?.id : providerId
  const provider = resolved ? getCustomProviderConfig(resolved) : null
  return provider?.models || []
}

export function getCustomBaseUrl(providerId?: string): string {
  const resolved = providerId === undefined || providerId === LEGACY_PROVIDER_ID
    ? getStoredCustomProviders()[0]?.id || null
    : resolveCustomProviderId(providerId)
  const provider = resolved ? getCustomProviderConfig(resolved) : null
  return provider?.baseUrl || ''
}

export function getCustomProviderApiKey(providerId?: string): string {
  if (providerId === undefined || providerId === LEGACY_PROVIDER_ID) {
    const legacy = getSetting(LEGACY_API_KEY) || ''
    if (legacy) return legacy
    const firstId = getStoredCustomProviders()[0]?.id
    if (!firstId || firstId === LEGACY_PROVIDER_ID) return ''
    return getSetting(`${API_KEY_PREFIX}${firstId}`) || ''
  }
  if (!CUSTOM_PROVIDER_ID_RE.test(providerId)) return ''
  return getSetting(`${API_KEY_PREFIX}${providerId}`) || ''
}

function toClient(baseUrl: string, apiKey: string, cacheKey: string): OpenAI {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
  const cached = clientCache.get(cacheKey)
  if (cached && cached.baseUrl === normalizedBaseUrl && cached.apiKey === apiKey) {
    return cached.client
  }
  const client = new OpenAI({
    baseURL: `${normalizedBaseUrl}/v1`,
    apiKey: apiKey || 'custom',
  })
  clientCache.set(cacheKey, { baseUrl: normalizedBaseUrl, apiKey, client })
  return client
}

function toAnthropicClient(baseUrl: string, apiKey: string, cacheKey: string): Anthropic {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '')
  const cached = anthropicClientCache.get(cacheKey)
  if (cached && cached.baseUrl === normalizedBaseUrl && cached.apiKey === apiKey) {
    return cached.client
  }
  const client = new Anthropic({
    apiKey: apiKey || 'custom',
    baseURL: normalizedBaseUrl,
  })
  anthropicClientCache.set(cacheKey, { baseUrl: normalizedBaseUrl, apiKey, client })
  return client
}

export function getCustomClient(providerId?: string): OpenAI {
  const resolved = providerId === undefined || providerId === LEGACY_PROVIDER_ID
    ? resolveCustomProviderId('custom')
    : resolveCustomProviderId(providerId)
  if (!resolved) {
    throw new Error('CUSTOM_PROVIDER_NOT_FOUND')
  }
  const baseUrl = getCustomBaseUrl(resolved)
  const apiKey = getCustomProviderApiKey(resolved)
  if (!baseUrl) throw new Error('CUSTOM_BASE_URL_NOT_SET')
  return toClient(baseUrl, apiKey, resolved)
}

function getCustomProviderConfigOrThrow(providerId: string): StoredCustomProvider {
  const provider = getCustomProviderConfig(providerId)
  if (!provider) throw new Error('CUSTOM_PROVIDER_NOT_FOUND')
  return provider
}

function toOpenAIMessages(params: LLMMessageParams): OpenAI.ChatCompletionMessageParam[] {
  const messages: OpenAI.ChatCompletionMessageParam[] = []
  if (params.systemInstruction) {
    messages.push({ role: 'system', content: params.systemInstruction })
  }
  for (const m of params.messages) {
    messages.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })
  }
  return messages
}

function toAnthropicMessages(params: LLMMessageParams): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const m of params.messages) {
    messages.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })
  }
  return messages
}

function createCustomProvider(name: string, providerId: string): LLMProvider {
  return {
    name,
    requireKey() {
      if (!getCustomBaseUrl(providerId)) {
        throw new Error('CUSTOM_BASE_URL_NOT_SET')
      }
    },
    async createMessage(params: LLMMessageParams): Promise<LLMStreamResult> {
      const provider = getCustomProviderConfigOrThrow(providerId)
      if (provider.apiFormat === 'anthropic') {
        const client = toAnthropicClient(provider.baseUrl, getCustomProviderApiKey(provider.id), `${provider.id}:anthropic`)
        const response = await client.messages.create({
          model: params.model,
          max_tokens: params.maxTokens,
          ...(params.systemInstruction ? { system: params.systemInstruction } : {}),
          messages: toAnthropicMessages(params),
        })
        const block = response.content[0]
        if (block.type !== 'text') {
          throw new Error('Unexpected response type')
        }
        return {
          text: block.text,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        }
      }

      const client = getCustomClient(providerId)
      const response = await client.chat.completions.create({
        model: params.model,
        max_completion_tokens: params.maxTokens,
        messages: toOpenAIMessages(params),
      })

      const text = response.choices[0]?.message?.content ?? ''
      return {
        text,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      }
    },
    async streamMessage(params: LLMMessageParams, onText: (delta: string) => void): Promise<LLMStreamResult> {
      const provider = getCustomProviderConfigOrThrow(providerId)
      if (provider.apiFormat === 'anthropic') {
        const client = toAnthropicClient(provider.baseUrl, getCustomProviderApiKey(provider.id), `${provider.id}:anthropic`)
        const stream = client.messages.stream({
          model: params.model,
          max_tokens: params.maxTokens,
          ...(params.systemInstruction ? { system: params.systemInstruction } : {}),
          messages: toAnthropicMessages(params),
        })

        stream.on('text', delta => {
          onText(delta)
        })
        const finalMessage = await stream.finalMessage()
        const block = finalMessage.content[0]
        if (block.type !== 'text') {
          throw new Error('Unexpected response type')
        }
        return {
          text: block.text,
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
        }
      }

      const client = getCustomClient(providerId)
      const stream = await client.chat.completions.create({
        model: params.model,
        max_completion_tokens: params.maxTokens,
        messages: toOpenAIMessages(params),
        stream: true,
        stream_options: { include_usage: true },
      })

      let fullText = ''
      let inputTokens = 0
      let outputTokens = 0

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? ''
        if (delta) {
          fullText += delta
          onText(delta)
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens
          outputTokens = chunk.usage.completion_tokens ?? outputTokens
        }
      }

      return { text: fullText, inputTokens, outputTokens }
    },
  }
}

export const customProvider: LLMProvider = createCustomProvider('custom', LEGACY_PROVIDER_ID)

export function getCustomProviderById(providerId: string): LLMProvider {
  const resolved = resolveCustomProviderId(providerId)
  if (!resolved) throw new Error('CUSTOM_PROVIDER_NOT_FOUND')
  const provider = getCustomProviderConfig(resolved)
  if (!provider) throw new Error('CUSTOM_PROVIDER_NOT_FOUND')
  return createCustomProvider(provider.name, resolved)
}

export function getCustomProviderName(providerId: string): string | undefined {
  const resolved = resolveCustomProviderId(providerId)
  const provider = resolved ? getCustomProviderConfig(resolved) : null
  return provider?.name
}

export function isCustomProviderId(providerId: string): boolean {
  return providerId === LEGACY_PROVIDER_ID || CUSTOM_PROVIDER_ID_RE.test(providerId)
}

export { FOLDER_TAG as CUSTOM_PROVIDER_PREFIX, API_KEY_PREFIX }
