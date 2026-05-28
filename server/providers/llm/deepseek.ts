import OpenAI from 'openai'
import { getSetting } from '../../db.js'
import type { LLMProvider, LLMMessageParams, LLMStreamResult } from './provider.js'

let cachedApiKey = ''
let cachedClient: OpenAI | null = null

export function getDeepSeekApiKey(): string {
  return getSetting('api_key.deepseek') || ''
}

export function getDeepSeekClient(): OpenAI {
  const apiKey = getDeepSeekApiKey()
  if (cachedClient && apiKey === cachedApiKey) return cachedClient
  cachedApiKey = apiKey
  cachedClient = new OpenAI({
    baseURL: 'https://api.deepseek.com/v1',
    apiKey,
  })
  return cachedClient
}

export const deepseekProvider: LLMProvider = {
  name: 'deepseek',

  requireKey() {
    if (!getSetting('api_key.deepseek')) {
      throw new Error('DEEPSEEK_KEY_NOT_SET')
    }
  },

  async createMessage(params: LLMMessageParams): Promise<LLMStreamResult> {
    const client = getDeepSeekClient()
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

    const response = await client.chat.completions.create({
      model: params.model,
      max_completion_tokens: params.maxTokens,
      messages,
    })

    const text = response.choices[0]?.message?.content ?? ''
    return {
      text,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    }
  },

  async streamMessage(params: LLMMessageParams, onText: (delta: string) => void): Promise<LLMStreamResult> {
    const client = getDeepSeekClient()
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

    const stream = await client.chat.completions.create({
      model: params.model,
      max_completion_tokens: params.maxTokens,
      messages,
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
