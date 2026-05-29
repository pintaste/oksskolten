import { useMemo, useState } from 'react'
import { useI18n } from '../../lib/i18n'
import { useAppLayout } from '../../app'
import { Separator } from '@/components/ui/separator'
import { ProviderConfigSection } from './sections/provider-config-section'
import { TaskModelSection } from './sections/task-model-section'

const HIDDEN_PROVIDER_STORAGE_KEY = 'oksskolten.hiddenProviders'
// Providers collapsed into the shortcuts bar by default (custom provider stays visible as the add-card)
const DEFAULT_HIDDEN: string[] = ['claude-code', 'ollama', 'vllm', 'deepseek', 'mimo']

function useHiddenLlmProviders() {
  const [hiddenProviders, setHiddenProviders] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_PROVIDER_STORAGE_KEY)
      if (!raw) return DEFAULT_HIDDEN
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(p => typeof p === 'string' && p !== 'custom') : DEFAULT_HIDDEN
    } catch {
      return DEFAULT_HIDDEN
    }
  })

  const hiddenProviderSet = useMemo(() => new Set(hiddenProviders), [hiddenProviders])

  function setHiddenProvider(provider: string, hidden: boolean) {
    setHiddenProviders(prev => {
      const next = new Set(prev)
      if (hidden) next.add(provider)
      else next.delete(provider)
      const nextList = Array.from(next)
      localStorage.setItem(HIDDEN_PROVIDER_STORAGE_KEY, JSON.stringify(nextList))
      return nextList
    })
  }

  return { hiddenProviders, setHiddenProvider, hiddenProviderSet }
}

export function IntegrationTab() {
  const { settings } = useAppLayout()
  const { t } = useI18n()
  const { hiddenProviders, setHiddenProvider } = useHiddenLlmProviders()

  return (
    <div className="space-y-6">
      <ProviderConfigSection t={t} hiddenProviders={hiddenProviders} setHiddenProvider={setHiddenProvider} />
      <Separator />
      <TaskModelSection settings={settings} t={t} hiddenProviders={hiddenProviders} />
    </div>
  )
}
