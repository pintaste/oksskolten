import { useMemo, useCallback } from 'react'
import useSWR from 'swr'
import { fetcher } from '../../../lib/fetcher'
import { PROVIDER_LABELS, LLM_API_PROVIDERS, TRANSLATE_SERVICE_PROVIDERS } from '../../../data/aiModels'
import { isMessageKey } from '../../../lib/i18n'
import type { TFunc, StoredCustomProvider } from './providers/shared'
import { ApiProviderCard } from './providers/api-provider-card'
import { AnthropicCard } from './providers/anthropic-card'
import { ClaudeCodeCard } from './providers/claude-code-card'
import { OllamaCard } from './providers/ollama-card'
import { VllmCard } from './providers/vllm-card'
import { DeepSeekCard } from './providers/deepseek-card'
import { MimoCard } from './providers/mimo-card'
import { CustomCard, CustomProviderCard } from './providers/custom-card'

const HIDEABLE_LLM_PROVIDERS = new Set([
  'anthropic',
  'gemini',
  'openai',
  'deepseek',
  'mimo',
  'claude-code',
  'ollama',
  'vllm',
])

interface ProviderConfigSectionProps {
  t: TFunc
  hiddenProviders: string[]
  setHiddenProvider: (provider: string, hidden: boolean) => void
}

export function ProviderConfigSection({ t, hiddenProviders, setHiddenProvider }: ProviderConfigSectionProps) {
  const hiddenProviderSet = useMemo(() => new Set(hiddenProviders), [hiddenProviders])
  const { data: customProviderData, mutate: mutateCustomProviders } = useSWR<{ providers: StoredCustomProvider[] }>(
    '/api/settings/custom-providers',
    fetcher,
    { revalidateOnFocus: false },
  )
  const customProviders = customProviderData?.providers || []
  const refreshCustomProviders = useCallback(() => {
    void mutateCustomProviders()
  }, [mutateCustomProviders])

  function handleHideProvider(provider: string) {
    if (!HIDEABLE_LLM_PROVIDERS.has(provider)) return
    setHiddenProvider(provider, true)
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-text mb-1">{t('integration.providerConfig')}</h2>
        <p className="text-xs text-muted mb-3">{t('integration.providerConfigDesc')}</p>

        {/* LLM providers */}
        <div className="grid grid-cols-1 gap-2.5 items-start">
          {LLM_API_PROVIDERS.filter(p => p !== 'deepseek' && p !== 'mimo' && p !== 'anthropic').map(provider => (
            !hiddenProviderSet.has(provider) && (
              <ApiProviderCard
                key={provider}
                provider={provider}
                t={t}
                onHideProvider={handleHideProvider}
                isHidable={HIDEABLE_LLM_PROVIDERS.has(provider)}
              />
            )
          ))}
          {!hiddenProviderSet.has('anthropic') && (
            <AnthropicCard t={t} onHideProvider={handleHideProvider} isHidable={HIDEABLE_LLM_PROVIDERS.has('anthropic')} />
          )}
          {!hiddenProviderSet.has('deepseek') && (
            <DeepSeekCard t={t} onHideProvider={handleHideProvider} isHidable={HIDEABLE_LLM_PROVIDERS.has('deepseek')} />
          )}
          {!hiddenProviderSet.has('mimo') && (
            <MimoCard t={t} onHideProvider={handleHideProvider} isHidable={HIDEABLE_LLM_PROVIDERS.has('mimo')} />
          )}
          {!hiddenProviderSet.has('claude-code') && (
            <ClaudeCodeCard t={t} onHideProvider={handleHideProvider} isHidable={HIDEABLE_LLM_PROVIDERS.has('claude-code')} />
          )}
          {!hiddenProviderSet.has('ollama') && (
            <OllamaCard t={t} onHideProvider={handleHideProvider} isHidable={HIDEABLE_LLM_PROVIDERS.has('ollama')} />
          )}
          {!hiddenProviderSet.has('vllm') && (
            <VllmCard t={t} onHideProvider={handleHideProvider} isHidable={HIDEABLE_LLM_PROVIDERS.has('vllm')} />
          )}
          {customProviders.map(provider => (
            <CustomProviderCard
              key={provider.id}
              provider={provider}
              t={t}
              onSaved={refreshCustomProviders}
            />
          ))}
          <CustomCard t={t} onSaved={refreshCustomProviders} />
        </div>

        {/* Hidden providers shortcuts */}
        {hiddenProviders.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted mb-2 select-none">{t('integration.hiddenProviders')}</div>
            <div className="flex flex-wrap gap-1.5">
              {hiddenProviders.map(p => {
                const labelKey = PROVIDER_LABELS[p as keyof typeof PROVIDER_LABELS]
                const label = labelKey && isMessageKey(labelKey) ? t(labelKey) : (labelKey || p)
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setHiddenProvider(p, false)}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-bg-card text-muted hover:text-text hover:bg-hover transition-colors select-none"
                  >
                    + {label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Translation services — merged into same section */}
        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted mb-2 select-none">{t('integration.translateServiceConfig')}</div>
          <div className="grid grid-cols-1 gap-2.5 items-start">
            {TRANSLATE_SERVICE_PROVIDERS.map(provider => (
              <ApiProviderCard key={provider} provider={provider} t={t} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
