import type { LLMProvider } from './provider.js'
import { anthropicProvider } from './anthropic.js'
import { claudeCodeProvider } from './claude-code.js'
import { customProvider, getCustomProviderById, isCustomProviderId } from './custom.js'
import { deepseekProvider } from './deepseek.js'
import { geminiProvider } from './gemini.js'
import { mimoProvider } from './mimo.js'
import { ollamaProvider } from './ollama.js'
import { openaiProvider } from './openai.js'
import { vllmProvider } from './vllm.js'

const providers = new Map<string, LLMProvider>()

providers.set('anthropic', anthropicProvider)
providers.set('gemini', geminiProvider)
providers.set('openai', openaiProvider)
providers.set('claude-code', claudeCodeProvider)
providers.set('ollama', ollamaProvider)
providers.set('vllm', vllmProvider)
providers.set('deepseek', deepseekProvider)
providers.set('mimo', mimoProvider)
providers.set('custom', customProvider)

export function getProvider(name: string): LLMProvider {
  if (isCustomProviderId(name)) {
    return getCustomProviderById(name)
  }

  const provider = providers.get(name)
  if (provider) return provider
  throw new Error(`Unknown LLM provider: ${name}`)
}
