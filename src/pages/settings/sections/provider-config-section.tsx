import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import useSWR from 'swr'
import { fetcher, apiPost, apiPatch, apiDelete } from '../../../lib/fetcher'
import { PROVIDER_LABELS, LLM_API_PROVIDERS, TRANSLATE_SERVICE_PROVIDERS } from '../../../data/aiModels'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { ExternalLink, CircleDot, CircleCheck, CircleSlash, ChevronDown, Pencil, Trash2, Search, Download, Zap, RotateCcw, EyeOff, Puzzle } from 'lucide-react'
import { isMessageKey } from '../../../lib/i18n'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type TFunc = (key: any, params?: Record<string, string>) => string

type CustomApiFormat = 'openai' | 'anthropic'

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

function getProviderConnectedLabel(t: TFunc, provider: string) {
  const connectedKey = `${provider}.connected`
  return isMessageKey(connectedKey) ? t(connectedKey) : ''
}

function getProviderConnectionFailedLabel(t: TFunc, provider: string) {
  const failedKey = `${provider}.connectionFailed`
  return isMessageKey(failedKey) ? t(failedKey) : t('ollama.connectionFailed')
}

function getProviderStatusText(
  t: TFunc,
  provider: string,
  isConfigured: boolean,
  testResult: { ok: boolean } | null,
) {
  if (!isConfigured) return t('chat.apiKeyNotSet')
  if (!testResult) return getProviderConnectedLabel(t, provider)
  return testResult.ok ? getProviderConnectedLabel(t, provider) : t('chat.apiKeyNotSet')
}

function ProviderConnectionError({
  testResult,
  label,
  as,
  className,
}: {
  testResult: { ok: boolean; error?: string } | null
  label: string
  as?: 'p' | 'span'
  className?: string
}) {
  if (!testResult || testResult.ok || !testResult.error) return null
  if (as === 'span') {
    return <span className={className ?? 'text-xs text-error'}>{`${label}: ${testResult.error}`}</span>
  }
  return <p className={className ?? 'text-xs text-error'}>{`${label}: ${testResult.error}`}</p>
}

function IconBtn({ onClick, title, disabled, children, className }: {
  onClick?: () => void
  title: string
  disabled?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-50 ${className ?? ''}`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}

function CollapsibleCardWrapper({
  header,
  actions,
  children,
}: {
  header: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(true)
  return (
    <div className="min-w-0 rounded-lg bg-bg-card border border-border shadow-sm overflow-hidden">
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer select-none hover:bg-hover"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0 overflow-hidden">{header}</div>
        {actions && (
          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            {actions}
          </div>
        )}
        <ChevronDown
          size={13}
          className={`text-muted transition-transform shrink-0 ${collapsed ? '-rotate-90' : ''}`}
        />
      </div>
      {!collapsed && (
        <div className="px-3 pb-3 pt-2 border-t border-border space-y-2.5">
          {children}
        </div>
      )}
    </div>
  )
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
    <section className="space-y-7">
      <div>
        <h2 className="text-base font-semibold text-text mb-1">{t('integration.llmProviderConfig')}</h2>
        <p className="text-xs text-muted mb-3">{t('integration.llmProviderConfigDesc')}</p>
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

        {/* Hidden providers shortcuts — restored here, below Custom */}
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
      </div>
      <div className="border-t border-border pt-5">
        <h2 className="text-base font-semibold text-text mb-1">{t('integration.translateServiceConfig')}</h2>
        <p className="text-xs text-muted mb-3">{t('integration.translateServiceConfigDesc')}</p>
        <div className="grid grid-cols-1 gap-2.5 items-start">
          {TRANSLATE_SERVICE_PROVIDERS.map(provider => (
            <ApiProviderCard key={provider} provider={provider} t={t} />
          ))}
        </div>
      </div>
    </section>
  )
}

interface ApiProviderCardProps {
  provider: string
  t: TFunc
  onHideProvider?: (provider: string) => void
  isHidable?: boolean
}

function ApiProviderCard({ provider, t, onHideProvider, isHidable }: ApiProviderCardProps) {
  const { data: keyStatus, mutate: mutateKeyStatus } = useSWR<{ configured: boolean }>(
    `/api/settings/api-keys/${provider}`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: prefs, mutate: mutatePrefs } = useSWR<Record<string, string | null>>(
    '/api/settings/preferences',
    fetcher,
    { revalidateOnFocus: false },
  )

  const isLlmProvider = (LLM_API_PROVIDERS as readonly string[]).includes(provider)
  const savedBaseUrl = prefs?.[`${provider}.base_url`] || ''
  const isConfigured = keyStatus?.configured

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; model_count?: number; error?: string } | null>(null)

  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!prefs || initialized) return
    setBaseUrlInput(prefs[`${provider}.base_url`] || '')
    setInitialized(true)
  }, [prefs, initialized, provider])

  // Auto-test on first load when configured
  const autoTested = useRef(false)
  useEffect(() => {
    if (autoTested.current || isConfigured === undefined) return
    if (!isConfigured) return
    autoTested.current = true
    void handleTest()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured])

  function showMessage(text: string, type: 'success' | 'error') {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  const endpoint = `/api/settings/api-keys/${provider}`
  const savedMsg = provider === 'gemini' ? t('gemini.apiKeySaved')
    : provider === 'openai' ? t('openai.apiKeySaved')
    : provider === 'google-translate' ? t('googleTranslate.apiKeySaved')
    : provider === 'deepl' ? t('deepl.apiKeySaved')
    : t('chat.apiKeySaved')
  const deletedMsg = provider === 'gemini' ? t('gemini.apiKeyDeleted')
    : provider === 'openai' ? t('openai.apiKeyDeleted')
    : provider === 'google-translate' ? t('googleTranslate.apiKeyDeleted')
    : provider === 'deepl' ? t('deepl.apiKeyDeleted')
    : t('chat.apiKeyDeleted')
  const placeholder = provider === 'gemini' ? 'AIza...'
    : provider === 'openai' ? 'sk-...'
    : provider === 'google-translate' ? 'AIza...'
    : provider === 'deepl' ? '...'
    : 'sk-ant-...'
  const apiKeyHelpLink = provider === 'google-translate'
    ? { href: 'https://cloud.google.com/translate/docs/setup', label: t('googleTranslate.getApiKey') }
    : provider === 'deepl'
      ? { href: 'https://www.deepl.com/en/account/summary', label: t('deepl.getApiKey') }
      : null

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const promises: Promise<any>[] = []
      if (apiKeyInput) {
        promises.push(apiPost(endpoint, { apiKey: apiKeyInput }))
      }
      if (isLlmProvider && baseUrlInput !== savedBaseUrl) {
        promises.push(apiPatch('/api/settings/preferences', { [`${provider}.base_url`]: baseUrlInput || '' }))
      }
      await Promise.all(promises)
      void mutateKeyStatus()
      void mutatePrefs()
      setApiKeyInput('')
      showMessage(savedMsg, 'success')
      // auto-test after saving
      void handleTest()
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (saving) return
    setSaving(true)
    try {
      await Promise.all([
        apiPost(endpoint, { apiKey: '' }),
        isLlmProvider ? apiPatch('/api/settings/preferences', { [`${provider}.base_url`]: '' }) : Promise.resolve(),
      ])
      void mutateKeyStatus()
      void mutatePrefs()
      setApiKeyInput('')
      setBaseUrlInput('')
      setTestResult(null)
      showMessage(deletedMsg, 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = useCallback(async () => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetcher(`/api/settings/${provider}/status`) as { ok: boolean; model_count?: number; error?: string }
      setTestResult(res)
    } catch {
      setTestResult({ ok: false, error: 'Request failed' })
    } finally {
      setTesting(false)
    }
  }, [testing, provider])

  const hasChanges = !!apiKeyInput || (isLlmProvider && baseUrlInput !== savedBaseUrl)
  const dotClass = hasChanges ? 'bg-error' : testResult?.ok ? 'bg-success' : testResult ? 'bg-error' : 'bg-muted'
  const statusText = getProviderStatusText(t, provider, !!isConfigured, testResult)

  return (
    <CollapsibleCardWrapper
      header={<>
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-sm font-medium text-text">{t(PROVIDER_LABELS[provider])}</span>
        <span className="text-xs text-muted truncate">{statusText}</span>
      </>}
      actions={<>
        {isConfigured && (
          <IconBtn onClick={handleTest} disabled={testing}
            title={t('ollama.testConnection')}
            className="p-1 text-muted hover:text-text transition-colors disabled:opacity-50">
            <Zap size={13} className={testing ? 'animate-pulse' : ''} />
          </IconBtn>
        )}
        {isConfigured && (
          <IconBtn onClick={handleDelete} disabled={saving}
            title={t('chat.apiKeyDelete')} className="p-1 text-muted/60 hover:text-error transition-colors disabled:opacity-50">
            <RotateCcw size={13} />
          </IconBtn>
        )}
        {isHidable && onHideProvider && (
          <IconBtn onClick={() => onHideProvider(provider)}
            title={t('integration.removeProvider')}
            className="p-1 text-muted/60 hover:text-muted transition-colors">
            <EyeOff size={13} />
          </IconBtn>
        )}
      </>}
    >
      <FormField
        label={
          <span className="flex items-center w-full gap-2">
            <span className="truncate">{t('chat.apiKey')}</span>
            {apiKeyHelpLink && (
              <a
                href={apiKeyHelpLink.href}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-accent hover:underline"
              >
                {apiKeyHelpLink.label}
              </a>
            )}
          </span>
        }
        compact
      >
        <Input
          type="password"
          value={apiKeyInput}
          onChange={e => setApiKeyInput(e.target.value)}
          placeholder={isConfigured ? '••••••••' : placeholder}
          className="py-1.5"
        />
      </FormField>

      {isLlmProvider && (
        <FormField label={<span>{t('anthropic.baseUrl')} <span className="font-normal text-muted/70">({t('anthropic.baseUrlDesc')})</span></span>} compact>
          <Input type="text" value={baseUrlInput} onChange={e => setBaseUrlInput(e.target.value)}
            placeholder={t('anthropic.baseUrlPlaceholder')} className="py-1.5" />
        </FormField>
      )}

      <div className="flex items-center gap-1.5">
        {hasChanges && (
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none shrink-0">
            {saving ? '...' : t('settings.save')}
          </button>
        )}
        <ProviderConnectionError
          testResult={testResult}
          label={getProviderConnectionFailedLabel(t, provider)}
          as="span"
        />
      </div>

      {message && (
        <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>{message.text}</p>
      )}
    </CollapsibleCardWrapper>
  )
}

function ClaudeCodeCard({
  t,
  onHideProvider,
  isHidable,
}: {
  t: TFunc
  onHideProvider?: (provider: string) => void
  isHidable?: boolean
}) {
  const { data: authStatus } = useSWR<{ loggedIn?: boolean; email?: string; plan?: string; error?: string }>(
    '/api/chat/claude-code-status',
    fetcher,
    { revalidateOnFocus: false },
  )

  let statusDot = 'bg-error'
  let statusText: React.ReactNode = '...'

  if (authStatus !== undefined) {
    if (authStatus.error?.includes('not found')) {
      statusDot = 'bg-error'
      statusText = t('chat.authNotInstalled')
    } else if (authStatus.loggedIn) {
      statusDot = 'bg-success'
      statusText = (
        <>
          {t('chat.authConnected')}
          {authStatus.email && <span className="text-muted ml-1.5">({authStatus.email})</span>}
        </>
      )
    } else {
      statusDot = 'bg-warning'
      statusText = (
        <div>
          <span>{t('chat.authNotConnected')}</span>
          <p className="text-muted mt-0.5">{t('chat.authRunLogin')}</p>
        </div>
      )
    }
  }

  return (
    <CollapsibleCardWrapper
      header={<>
        <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
        <span className="text-sm font-medium text-text">{t(PROVIDER_LABELS['claude-code'])}</span>
        <span className="text-xs text-muted">{statusText}</span>
      </>}
      actions={isHidable && onHideProvider ? (
        <IconBtn onClick={() => onHideProvider('claude-code')}
          title={t('integration.removeProvider')}
          className="p-1 text-muted/60 hover:text-muted transition-colors">
            <EyeOff size={13} />
          </IconBtn>
      ) : undefined}
    >
      <div className="rounded-md bg-bg-subtle px-3 py-2 text-xs text-muted select-none">
        <p>{t('chat.authNote')}</p>
        <div className="mt-1.5 space-y-0.5 text-[11px] text-muted/70">
          <div className="flex gap-1">
            <span className="w-[5.5em] shrink-0">{t('chat.authHowToLoginLabel')}</span>
            <code>claude auth login</code>
          </div>
          <div className="flex gap-1">
            <span className="w-[5.5em] shrink-0">{t('chat.authHowToLogoutLabel')}</span>
            <code>claude auth logout</code>
          </div>
        </div>
        <details className="mt-1.5">
          <summary className="text-[11px] text-muted/70 cursor-pointer select-none hover:text-muted">
            {t('chat.authNoteIssue')}
          </summary>
          <div className="mt-1 ml-3 space-y-0.5 text-[11px] text-muted/70">
            {([
              { id: 228, title: 'OAuth 2.0 Device Authorization Grant', status: 'not_planned' },
              { id: 7100, title: 'Headless/Remote Authentication', status: 'not_planned' },
              { id: 22992, title: 'Device Code Flow (RFC 8628)', status: 'open' },
              { id: 33269, title: 'OAuth login fails due to Cloudflare race condition', status: 'open' },
              { id: 34575, title: 'MCP connector sync + setup-token', status: 'open' },
            ] as { id: number; title: string; status: 'open' | 'completed' | 'not_planned' }[]).map(({ id, title, status }) => (
              <a key={id} href={`https://github.com/anthropics/claude-code/issues/${id}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 pl-2 hover:text-muted underline">
                {status === 'open' && <CircleDot size={10} className="shrink-0 text-success" />}
                {status === 'completed' && <CircleCheck size={10} className="shrink-0 text-purple-500" />}
                {status === 'not_planned' && <CircleSlash size={10} className="shrink-0 text-muted/50" />}
                <span className="tabular-nums w-[6ch] shrink-0">#{id}</span>
                <span>{title}</span>
                <ExternalLink size={10} className="shrink-0" />
              </a>
            ))}
          </div>
        </details>
      </div>
    </CollapsibleCardWrapper>
  )
}

function OllamaCard({
  t,
  onHideProvider,
  isHidable,
}: {
  t: TFunc
  onHideProvider?: (provider: string) => void
  isHidable?: boolean
}) {
  const { data: prefs, mutate: mutatePrefs } = useSWR<Record<string, string | null>>(
    '/api/settings/preferences',
    fetcher,
    { revalidateOnFocus: false },
  )
  const savedBaseUrl = prefs?.['ollama.base_url'] || ''
  const savedHeadersJson = prefs?.['ollama.custom_headers'] || ''
  const isConfigured = !!savedBaseUrl || !!savedHeadersJson
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; version?: string; model_count?: number; error?: string } | null>(null)

  // Custom headers state
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>([])

  // Sync inputs with saved values on first load
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!prefs || initialized) return
    setBaseUrlInput(prefs['ollama.base_url'] || '')
    const headersRaw = prefs['ollama.custom_headers'] || ''
    if (headersRaw) {
      try {
        const parsed = JSON.parse(headersRaw)
        setHeaders(Object.entries(parsed).map(([key, value]) => ({ key, value: String(value) })))
      } catch { /* ignore invalid JSON */ }
    }
    setInitialized(true)
  }, [prefs, initialized])

  function showMessage(text: string, type: 'success' | 'error') {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  function headersToJson(h: Array<{ key: string; value: string }>): string {
    if (h.length === 0) return ''
    const obj: Record<string, string> = {}
    for (const { key, value } of h) { if (key) obj[key] = value }
    return JSON.stringify(obj)
  }

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      await apiPatch('/api/settings/preferences', {
        'ollama.base_url': baseUrlInput || '',
        'ollama.custom_headers': headersToJson(headers),
      })
      void mutatePrefs()
      showMessage(t('ollama.baseUrlSaved'), 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }, [saving, baseUrlInput, headers, mutatePrefs, t])

  const handleTest = useCallback(async () => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetcher('/api/settings/ollama/status') as { ok: boolean; version?: string; model_count?: number; error?: string }
      setTestResult(res)
    } catch {
      setTestResult({ ok: false, error: 'Request failed' })
    } finally {
      setTesting(false)
    }
  }, [testing])

  const autoTested = useRef(false)
  useEffect(() => {
    if (autoTested.current) return
    autoTested.current = true
    void handleTest()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const removeHeader = useCallback((index: number) => {
    setHeaders(prev => prev.filter((_, i) => i !== index))
  }, [])

  const currentHeadersJson = headersToJson(headers)
  const hasChanges = baseUrlInput !== savedBaseUrl || currentHeadersJson !== (savedHeadersJson || '')
  const dotClass = hasChanges ? 'bg-error' : testResult?.ok ? 'bg-success' : testResult ? 'bg-error' : 'bg-muted'
  const statusText = getProviderStatusText(t, 'ollama', isConfigured, testResult)

  return (
      <CollapsibleCardWrapper
        header={<>
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
          <span className="text-sm font-medium text-text">{t('provider.ollama')}</span>
          {statusText && <span className="text-xs text-muted truncate">{statusText}</span>}
        </>}
      actions={<>
        <IconBtn onClick={handleTest} disabled={testing}
          title={t('ollama.testConnection')}
          className="p-1 text-muted hover:text-text transition-colors disabled:opacity-50">
          <Zap size={13} className={testing ? 'animate-pulse' : ''} />
        </IconBtn>
        {isHidable && onHideProvider && (
          <IconBtn onClick={() => onHideProvider('ollama')}
            title={t('integration.removeProvider')}
            className="p-1 text-muted/60 hover:text-muted transition-colors">
            <EyeOff size={13} />
          </IconBtn>
        )}
      </>}
    >
      <FormField label={t('ollama.baseUrl')} hint={t('ollama.baseUrlDesc')} compact>
        <Input type="text" value={baseUrlInput} onChange={e => setBaseUrlInput(e.target.value)}
          placeholder={t('ollama.baseUrlPlaceholder')} className="py-1.5" />
      </FormField>

      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-medium text-text select-none">{t('ollama.customHeaders')}</span>
          <span className="text-[11px] text-muted select-none">{t('ollama.customHeadersDesc')}</span>
        </div>
        {headers.map((h, i) => (
          <div key={i} className="flex items-center gap-1.5 mb-1">
            <Input type="text" value={h.key}
              onChange={e => setHeaders(prev => prev.map((item, j) => j === i ? { ...item, key: e.target.value } : item))}
              placeholder={t('ollama.headerKey')} className="w-[200px] py-1 text-xs" />
            <Input type="text" value={h.value}
              onChange={e => setHeaders(prev => prev.map((item, j) => j === i ? { ...item, value: e.target.value } : item))}
              placeholder={t('ollama.headerValue')} className="flex-1 py-1 text-xs" />
            <button type="button" onClick={() => removeHeader(i)}
              className="px-1.5 py-1 text-xs text-muted hover:text-error transition-colors select-none shrink-0">×</button>
          </div>
        ))}
        <button type="button" onClick={() => setHeaders(prev => [...prev, { key: '', value: '' }])}
          className="px-2 py-1 text-xs rounded border border-border text-muted hover:text-text hover:bg-hover transition-colors select-none">
          + {t('ollama.addHeader')}
        </button>
      </div>

      {hasChanges && (
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none shrink-0">
            {saving ? '...' : t('settings.save')}
          </button>
        </div>
      )}
      <ProviderConnectionError
        testResult={testResult}
        label={getProviderConnectionFailedLabel(t, 'ollama')}
      />

      {message && <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>{message.text}</p>}
    </CollapsibleCardWrapper>
  )
}

function VllmCard({
  t,
  onHideProvider,
  isHidable,
}: {
  t: TFunc
  onHideProvider?: (provider: string) => void
  isHidable?: boolean
}) {
  const { data: prefs, mutate: mutatePrefs } = useSWR<Record<string, string | null>>(
    '/api/settings/preferences',
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: keyStatus, mutate: mutateKeyStatus } = useSWR<{ configured: boolean }>(
    '/api/settings/api-keys/vllm',
    fetcher,
    { revalidateOnFocus: false },
  )

  const savedBaseUrl = prefs?.['vllm.base_url'] || ''
  const isConfigured = keyStatus?.configured

  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; model_count?: number; error?: string } | null>(null)

  // Sync inputs with saved values on first load
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!prefs || initialized) return
    setBaseUrlInput(prefs['vllm.base_url'] || '')
    setInitialized(true)
  }, [prefs, initialized])

  function showMessage(text: string, type: 'success' | 'error') {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const promises: Promise<any>[] = [
        apiPatch('/api/settings/preferences', { 'vllm.base_url': baseUrlInput || '' }),
      ]
      if (apiKeyInput) {
        promises.push(apiPost('/api/settings/api-keys/vllm', { apiKey: apiKeyInput }))
      }
      await Promise.all(promises)
      void mutatePrefs()
      void mutateKeyStatus()
      setApiKeyInput('')
      showMessage(t('vllm.baseUrlSaved'), 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }, [saving, baseUrlInput, apiKeyInput, mutatePrefs, mutateKeyStatus, t])

  const handleDeleteKey = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      await Promise.all([
        apiPost('/api/settings/api-keys/vllm', { apiKey: '' }),
        apiPatch('/api/settings/preferences', { 'vllm.base_url': '' }),
      ])
      void mutateKeyStatus()
      void mutatePrefs()
      setApiKeyInput('')
      setBaseUrlInput('')
      setTestResult(null)
      showMessage(t('vllm.apiKeyDeleted'), 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setSaving(false)
    }
  }, [saving, mutateKeyStatus, mutatePrefs, t])

  const handleTest = useCallback(async () => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetcher('/api/settings/vllm/status') as { ok: boolean; model_count?: number; error?: string }
      setTestResult(res)
    } catch {
      setTestResult({ ok: false, error: 'Request failed' })
    } finally {
      setTesting(false)
    }
  }, [testing])

  const autoTested = useRef(false)
  useEffect(() => {
    if (autoTested.current) return
    autoTested.current = true
    void handleTest()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasChanges = baseUrlInput !== savedBaseUrl || !!apiKeyInput
  const dotClass = hasChanges ? 'bg-error' : testResult?.ok ? 'bg-success' : testResult ? 'bg-error' : 'bg-muted'
  const statusText = getProviderStatusText(t, 'vllm', !!isConfigured, testResult)

  return (
      <CollapsibleCardWrapper
        header={<>
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
          <span className="text-sm font-medium text-text">{t('provider.vllm')}</span>
          {statusText && <span className="text-xs text-muted truncate">{statusText}</span>}
        </>}
      actions={<>
        <IconBtn onClick={handleTest} disabled={testing}
          title={t('vllm.testConnection')}
          className="p-1 text-muted hover:text-text transition-colors disabled:opacity-50">
          <Zap size={13} className={testing ? 'animate-pulse' : ''} />
        </IconBtn>
        {isConfigured && (
          <IconBtn onClick={handleDeleteKey} disabled={saving}
            title={t('chat.apiKeyDelete')} className="p-1 text-muted/60 hover:text-error transition-colors disabled:opacity-50">
            <RotateCcw size={13} />
          </IconBtn>
        )}
        {isHidable && onHideProvider && (
          <IconBtn onClick={() => onHideProvider('vllm')}
            title={t('integration.removeProvider')}
            className="p-1 text-muted/60 hover:text-muted transition-colors">
            <EyeOff size={13} />
          </IconBtn>
        )}
      </>}
    >
      <FormField label={t('vllm.baseUrl')} hint={t('vllm.baseUrlDesc')} compact>
        <Input type="text" value={baseUrlInput} onChange={e => setBaseUrlInput(e.target.value)}
          placeholder={t('vllm.baseUrlPlaceholder')} className="py-1.5" />
      </FormField>
      <FormField label={t('chat.apiKey')} compact>
        <Input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
          placeholder={isConfigured ? '••••••••' : '...'} className="py-1.5" />
      </FormField>

      {hasChanges && (
        <div className="flex items-center gap-1.5">
          {hasChanges && (
            <button type="button" onClick={handleSave} disabled={saving}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none shrink-0">
              {saving ? '...' : t('settings.save')}
            </button>
          )}
        </div>
      )}
      <ProviderConnectionError
        testResult={testResult}
        label={getProviderConnectionFailedLabel(t, 'vllm')}
      />

      {message && <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>{message.text}</p>}
    </CollapsibleCardWrapper>
  )
}

function DeepSeekCard({
  t,
  onHideProvider,
  isHidable,
}: {
  t: TFunc
  onHideProvider?: (provider: string) => void
  isHidable?: boolean
}) {
  const { data: keyStatus, mutate: mutateKeyStatus } = useSWR<{ configured: boolean }>(
    '/api/settings/api-keys/deepseek',
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: prefs, mutate: mutatePrefs } = useSWR<Record<string, string | null>>(
    '/api/settings/preferences',
    fetcher,
    { revalidateOnFocus: false },
  )

  const savedBaseUrl = prefs?.['deepseek.base_url'] || ''
  const isConfigured = keyStatus?.configured

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; model_count?: number; error?: string } | null>(null)


  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!prefs || initialized) return
    setBaseUrlInput(prefs['deepseek.base_url'] || '')
    setInitialized(true)
  }, [prefs, initialized])

  function showMessage(text: string, type: 'success' | 'error') {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const promises: Promise<any>[] = []
      if (apiKeyInput) {
        promises.push(apiPost('/api/settings/api-keys/deepseek', { apiKey: apiKeyInput }))
      }
      if (baseUrlInput !== savedBaseUrl) {
        promises.push(apiPatch('/api/settings/preferences', { 'deepseek.base_url': baseUrlInput || '' }))
      }
      await Promise.all(promises)
      void mutateKeyStatus()
      void mutatePrefs()
      setApiKeyInput('')
      showMessage(t('deepseek.apiKeySaved'), 'success')
      void handleTest()
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (saving) return
    setSaving(true)
    try {
      await Promise.all([
        apiPost('/api/settings/api-keys/deepseek', { apiKey: '' }),
        apiPatch('/api/settings/preferences', { 'deepseek.base_url': '' }),
      ])
      void mutateKeyStatus()
      void mutatePrefs()
      setApiKeyInput('')
      setBaseUrlInput('')
      setTestResult(null)
      showMessage(t('deepseek.apiKeyDeleted'), 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = useCallback(async () => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetcher('/api/settings/deepseek/status') as { ok: boolean; model_count?: number; error?: string }
      setTestResult(res)
    } catch {
      setTestResult({ ok: false, error: 'Request failed' })
    } finally {
      setTesting(false)
    }
  }, [testing])

  const autoTested = useRef(false)
  useEffect(() => {
    if (autoTested.current || isConfigured === undefined) return
    if (!isConfigured) return
    autoTested.current = true
    void handleTest()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured])

  const hasChanges = !!apiKeyInput || baseUrlInput !== savedBaseUrl
  const dotClass = hasChanges ? 'bg-error' : testResult?.ok ? 'bg-success' : testResult ? 'bg-error' : 'bg-muted'
  const statusText = getProviderStatusText(t, 'deepseek', !!isConfigured, testResult)

  return (
    <CollapsibleCardWrapper
      header={<>
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-sm font-medium text-text">{t(PROVIDER_LABELS['deepseek'])}</span>
        <span className="text-xs text-muted truncate">{statusText}</span>
      </>}
      actions={<>
        <IconBtn onClick={handleTest} disabled={testing}
          title={t('deepseek.testConnection')}
          className="p-1 text-muted hover:text-text transition-colors disabled:opacity-50">
          <Zap size={13} className={testing ? 'animate-pulse' : ''} />
        </IconBtn>
        {isConfigured && (
          <IconBtn onClick={handleDelete} disabled={saving}
            title={t('chat.apiKeyDelete')} className="p-1 text-muted/60 hover:text-error transition-colors disabled:opacity-50">
            <RotateCcw size={13} />
          </IconBtn>
        )}
        {isHidable && onHideProvider && (
          <IconBtn onClick={() => onHideProvider('deepseek')}
            title={t('integration.removeProvider')}
            className="p-1 text-muted/60 hover:text-muted transition-colors">
            <EyeOff size={13} />
          </IconBtn>
        )}
      </>}
    >
      <FormField label={t('chat.apiKey')} compact>
        <Input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
          placeholder={isConfigured ? '••••••••' : 'sk-...'} className="py-1.5" />
      </FormField>

      <FormField label={<span>{t('anthropic.baseUrl')} <span className="font-normal text-muted/70">({t('anthropic.baseUrlDesc')})</span></span>} compact>
        <Input type="text" value={baseUrlInput} onChange={e => setBaseUrlInput(e.target.value)}
          placeholder={t('anthropic.baseUrlPlaceholder')} className="py-1.5" />
      </FormField>

      {hasChanges && (
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none shrink-0">
            {saving ? '...' : t('settings.save')}
          </button>
        </div>
      )}
      <ProviderConnectionError
        testResult={testResult}
        label={getProviderConnectionFailedLabel(t, 'deepseek')}
        as="span"
      />

      {message && <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>{message.text}</p>}
    </CollapsibleCardWrapper>
  )
}

function MimoCard({
  t,
  onHideProvider,
  isHidable,
}: {
  t: TFunc
  onHideProvider?: (provider: string) => void
  isHidable?: boolean
}) {
  const { data: keyStatus, mutate: mutateKeyStatus } = useSWR<{ configured: boolean }>(
    '/api/settings/api-keys/mimo',
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: prefs, mutate: mutatePrefs } = useSWR<Record<string, string | null>>(
    '/api/settings/preferences',
    fetcher,
    { revalidateOnFocus: false },
  )

  const savedBaseUrl = prefs?.['mimo.base_url'] || ''
  const isConfigured = keyStatus?.configured

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; model_count?: number; error?: string } | null>(null)


  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!prefs || initialized) return
    setBaseUrlInput(prefs['mimo.base_url'] || '')
    setInitialized(true)
  }, [prefs, initialized])

  function showMessage(text: string, type: 'success' | 'error') {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const promises: Promise<any>[] = []
      if (apiKeyInput) {
        promises.push(apiPost('/api/settings/api-keys/mimo', { apiKey: apiKeyInput }))
      }
      if (baseUrlInput !== savedBaseUrl) {
        promises.push(apiPatch('/api/settings/preferences', { 'mimo.base_url': baseUrlInput || '' }))
      }
      await Promise.all(promises)
      void mutateKeyStatus()
      void mutatePrefs()
      setApiKeyInput('')
      showMessage(t('mimo.apiKeySaved'), 'success')
      void handleTest()
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (saving) return
    setSaving(true)
    try {
      await Promise.all([
        apiPost('/api/settings/api-keys/mimo', { apiKey: '' }),
        apiPatch('/api/settings/preferences', { 'mimo.base_url': '' }),
      ])
      void mutateKeyStatus()
      void mutatePrefs()
      setApiKeyInput('')
      setBaseUrlInput('')
      setTestResult(null)
      showMessage(t('mimo.apiKeyDeleted'), 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = useCallback(async () => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetcher('/api/settings/mimo/status') as { ok: boolean; model_count?: number; error?: string }
      setTestResult(res)
    } catch {
      setTestResult({ ok: false, error: 'Request failed' })
    } finally {
      setTesting(false)
    }
  }, [testing])

  const autoTested = useRef(false)
  useEffect(() => {
    if (autoTested.current || isConfigured === undefined) return
    if (!isConfigured) return
    autoTested.current = true
    void handleTest()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured])

  const hasChanges = !!apiKeyInput || baseUrlInput !== savedBaseUrl
  const dotClass = hasChanges ? 'bg-error' : testResult?.ok ? 'bg-success' : testResult ? 'bg-error' : 'bg-muted'
  const statusText = getProviderStatusText(t, 'mimo', !!isConfigured, testResult)

  return (
    <CollapsibleCardWrapper
      header={<>
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-sm font-medium text-text">{t(PROVIDER_LABELS['mimo'])}</span>
        <span className="text-xs text-muted truncate">{statusText}</span>
      </>}
      actions={<>
        <IconBtn onClick={handleTest} disabled={testing}
          title={t('mimo.testConnection')}
          className="p-1 text-muted hover:text-text transition-colors disabled:opacity-50">
          <Zap size={13} className={testing ? 'animate-pulse' : ''} />
        </IconBtn>
        {isConfigured && (
          <IconBtn onClick={handleDelete} disabled={saving}
            title={t('chat.apiKeyDelete')} className="p-1 text-muted/60 hover:text-error transition-colors disabled:opacity-50">
            <RotateCcw size={13} />
          </IconBtn>
        )}
        {isHidable && onHideProvider && (
          <IconBtn onClick={() => onHideProvider('mimo')}
            title={t('integration.removeProvider')}
            className="p-1 text-muted/60 hover:text-muted transition-colors">
            <EyeOff size={13} />
          </IconBtn>
        )}
      </>}
    >
      <FormField label={t('chat.apiKey')} compact>
        <Input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
          placeholder={isConfigured ? '••••••••' : '...'} className="py-1.5" />
      </FormField>

      <FormField label={<span>{t('anthropic.baseUrl')} <span className="font-normal text-muted/70">({t('anthropic.baseUrlDesc')})</span></span>} compact>
        <Input type="text" value={baseUrlInput} onChange={e => setBaseUrlInput(e.target.value)}
          placeholder={t('anthropic.baseUrlPlaceholder')} className="py-1.5" />
      </FormField>

      {hasChanges && (
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none shrink-0">
            {saving ? '...' : t('settings.save')}
          </button>
        </div>
      )}
      <ProviderConnectionError
        testResult={testResult}
        label={getProviderConnectionFailedLabel(t, 'mimo')}
        as="span"
      />

      {message && <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>{message.text}</p>}
    </CollapsibleCardWrapper>
  )
}

type StoredCustomProvider = {
  id: string
  name: string
  baseUrl: string
  models: string[]
  apiFormat: CustomApiFormat
  configured: boolean
}

function CustomCard({
  t,
  onSaved,
}: {
  t: TFunc
  onSaved: () => void
}) {
  return (
    <CollapsibleCardWrapper
      header={<>
        <span className="shrink-0 text-accent">
          <Puzzle size={14} />
        </span>
        <span className="text-sm font-medium text-text">{t('provider.custom')}</span>
        <span className="text-xs text-muted truncate">{t('custom.addProvider')}</span>
      </>}
    >
      <CustomProviderAddForm t={t} onSaved={onSaved} />
    </CollapsibleCardWrapper>
  )
}

type CustomProviderFormMode = 'add' | 'edit'

function CustomProviderForm({
  t,
  mode,
  provider,
  open = true,
  onSaved,
  onClose,
  renderActions,
}: {
  t: TFunc
  mode: CustomProviderFormMode
  provider?: StoredCustomProvider | null
  open?: boolean
  onSaved: () => void
  onClose?: () => void
  renderActions?: (opts: { saving: boolean; handleSave: () => void }) => React.ReactNode
}) {
  const isEditing = mode === 'edit'
  const [nameInput, setNameInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiFormat, setApiFormat] = useState<CustomApiFormat>('openai')
  const [manualModelInput, setManualModelInput] = useState('')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [enabledModels, setEnabledModels] = useState<string[]>([])
  const [modelSearch, setModelSearch] = useState('')
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const prevOpen = useRef(false)

  function showMessage(text: string, type: 'success' | 'error') {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 4000)
  }

  const resetAddForm = useCallback(() => {
    setNameInput('')
    setBaseUrlInput('')
    setApiKeyInput('')
    setApiFormat('openai')
    setManualModelInput('')
    setAvailableModels([])
    setEnabledModels([])
    setModelSearch('')
  }, [])

  const loadEditForm = useCallback((nextProvider: StoredCustomProvider | null) => {
    setNameInput(nextProvider?.name || '')
    setBaseUrlInput(nextProvider?.baseUrl || '')
    setApiKeyInput('')
    setApiFormat(nextProvider?.apiFormat || 'openai')
    setManualModelInput('')
    setModelSearch('')
    setMessage(null)
    const models = nextProvider?.models || []
    setAvailableModels(models)
    setEnabledModels(models)
  }, [])

  useEffect(() => {
    if (!isEditing) {
      if (!prevOpen.current) {
        resetAddForm()
        prevOpen.current = true
      }
      return
    }

    if (!open) {
      prevOpen.current = false
      return
    }

    if (!prevOpen.current) {
      loadEditForm(provider ?? null)
      prevOpen.current = true
    }
  }, [isEditing, open, provider, resetAddForm, loadEditForm])

  const normalizedUrl = baseUrlInput.trim()

  const handleFetchModels = useCallback(async () => {
    if (fetching || !normalizedUrl) return
    setFetching(true)
    try {
      const res = await apiPost('/api/settings/custom/models/preview', {
        providerId: isEditing ? provider?.id || null : null,
        baseUrl: normalizedUrl,
        apiKey: apiKeyInput.trim(),
        apiFormat,
      }) as { models: Array<{ name: string }> }
      const fetched = (res.models || []).map(m => m.name).filter(Boolean)
      setAvailableModels(prev => mergeModels(fetched, prev))
      setEnabledModels(prev => mergeModels(fetched, prev))
      if (!fetched.length) showMessage(t('custom.noModels'), 'error')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Fetch failed', 'error')
    } finally {
      setFetching(false)
    }
  }, [fetching, normalizedUrl, apiFormat, apiKeyInput, isEditing, provider?.id, t])

  const handleAddManualModel = useCallback(() => {
    const model = manualModelInput.trim()
    if (!model) return
    setAvailableModels(prev => mergeModels([model], prev))
    setEnabledModels(prev => mergeModels([model], prev))
    setManualModelInput('')
  }, [manualModelInput])

  function toggleModel(name: string) {
    setEnabledModels(prev =>
      prev.includes(name) ? prev.filter(m => m !== name) : [...prev, name],
    )
  }

  const sortedModels = useMemo(() => {
    const enabled = availableModels.filter(m => enabledModels.includes(m))
    const disabled = availableModels.filter(m => !enabledModels.includes(m))
    return [...enabled, ...disabled]
  }, [availableModels, enabledModels])

  const filteredModels = useMemo(
    () => modelSearch ? sortedModels.filter(m => m.toLowerCase().includes(modelSearch.toLowerCase())) : sortedModels,
    [sortedModels, modelSearch],
  )

  const handleSelectAllModels = useCallback(() => {
    setEnabledModels(prev => {
      const set = new Set(prev)
      filteredModels.forEach(model => {
        set.add(model)
      })
      return Array.from(set)
    })
  }, [filteredModels])

  const handleClearModels = useCallback(() => {
    if (!filteredModels.length) return
    setEnabledModels(prev => prev.filter(model => !filteredModels.includes(model)))
  }, [filteredModels])

  const handleSave = useCallback(async () => {
    if (saving) return
    if (!nameInput.trim()) { showMessage(t('custom.requiredFields'), 'error'); return }
    if (!normalizedUrl) { showMessage(t('custom.requiredFields'), 'error'); return }
    if (!isEditing && !apiKeyInput.trim()) { showMessage(t('custom.requiredFields'), 'error'); return }
    if (!enabledModels.length) { showMessage(t('custom.requiredFields'), 'error'); return }
    setSaving(true)
    try {
      const payload = {
        providerId: isEditing ? provider?.id || null : null,
        name: nameInput.trim(),
        baseUrl: normalizedUrl,
        apiKey: isEditing ? apiKeyInput.trim() || undefined : apiKeyInput.trim(),
        apiFormat,
        models: enabledModels,
      } as {
        providerId: string | null
        name: string
        baseUrl: string
        apiKey?: string
        apiFormat: CustomApiFormat
        models: string[]
      }
      const result = await apiPost('/api/settings/custom-providers', payload) as { provider?: { id: string } }
      onSaved()
      if (!isEditing) {
        resetAddForm()
        showMessage(t('custom.connected'), 'success')
      } else if (result?.provider?.id) {
        void fetcher(`/api/settings/custom-providers/${result.provider.id}/status`)
        onClose?.()
      }
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
    }, [saving, isEditing, provider?.id, nameInput, normalizedUrl, apiFormat, enabledModels, apiKeyInput, onSaved, onClose, t, resetAddForm])

  const apiKeyPlaceholder = isEditing ? '••••••••' : 'your-api-key'

  return (
    <div className="space-y-2.5">
      <FormField label={t('custom.providerName')} compact>
        <Input
          type="text"
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          placeholder={t('custom.providerNamePlaceholder')}
          className="py-1.5"
        />
      </FormField>

      <FormField label={t('custom.baseUrl')} compact>
        <Input
          type="text"
          value={baseUrlInput}
          onChange={e => setBaseUrlInput(e.target.value)}
          placeholder="https://api.example.com/v1"
          className="py-1.5"
        />
      </FormField>

      <FormField label={t('custom.apiKey')} compact>
        <Input
          type="password"
          value={apiKeyInput}
          onChange={e => setApiKeyInput(e.target.value)}
          placeholder={apiKeyPlaceholder}
          className="py-1.5"
        />
      </FormField>

      <FormField label={t('custom.apiFormat')} compact>
        <select
          value={apiFormat}
          onChange={e => setApiFormat(e.target.value as CustomApiFormat)}
          className="w-full h-9 px-3 rounded-lg border border-border bg-bg-subtle text-xs text-text"
        >
          <option value="openai">{t('custom.apiFormatOpenAI')}</option>
          <option value="anthropic">{t('custom.apiFormatAnthropic')}</option>
        </select>
      </FormField>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-text select-none">{t('custom.availableModels')}</span>
            {availableModels.length > 0 && (
              <span className="text-[10px] text-muted select-none">
                {t('custom.showingModels', { count: String(filteredModels.length) })}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleFetchModels}
            disabled={!normalizedUrl || fetching}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-50 select-none"
          >
            <Download size={11} />
            {fetching ? t('custom.fetchingModels') : t('custom.fetchModels')}
          </button>
        </div>

        <div className="flex flex-col gap-2 mb-1.5 sm:flex-row">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <Input
              type="text"
              value={modelSearch}
              onChange={e => setModelSearch(e.target.value)}
              placeholder={t('custom.searchModels')}
              className="pl-7 py-1.5 text-xs"
            />
          </div>
          <div className="flex gap-1">
            <Input
              type="text"
              value={manualModelInput}
              onChange={e => setManualModelInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddManualModel() } }}
              placeholder={t('custom.manualModelPlaceholder')}
              className="w-full py-1.5 text-xs sm:w-32"
            />
            <button
              type="button"
              onClick={handleAddManualModel}
              className="px-2 py-1.5 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors shrink-0"
            >
              {t('custom.addModel')}
            </button>
            <button
              type="button"
              onClick={handleSelectAllModels}
              disabled={!filteredModels.length}
              className="px-2 py-1.5 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-50 select-none"
            >
              {t('custom.selectAll')}
            </button>
            <button
              type="button"
              onClick={handleClearModels}
              disabled={!filteredModels.length}
              className="px-2 py-1.5 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-50 select-none"
            >
              {t('custom.clearModels')}
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-bg-subtle max-h-48 overflow-y-auto divide-y divide-border">
          {filteredModels.length === 0 ? (
            <p className="text-xs text-muted p-3 select-none">{t('custom.noModels')}</p>
          ) : (
            filteredModels.map(model => {
              const enabled = enabledModels.includes(model)
              return (
                <label key={model} className="flex items-center gap-2 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggleModel(model)}
                    className="w-3.5 h-3.5 shrink-0 rounded border border-border bg-bg-card text-accent focus:ring-accent focus:ring-offset-bg-subtle"
                  />
                  <span className="text-xs text-text truncate select-none">{model}</span>
                </label>
              )
            })
          )}
        </div>
      </div>

      {message && (
        <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>
          {message.text}
        </p>
      )}

      {renderActions?.({ saving, handleSave })}
    </div>
  )
}

function CustomProviderAddForm({ t, onSaved }: { t: TFunc; onSaved: () => void }) {
  return (
    <CustomProviderForm
      mode="add"
      t={t}
      onSaved={onSaved}
      renderActions={({ saving, handleSave }) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-sm rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? t('settings.saving') : t('settings.save')}
          </button>
        </div>
      )}
    />
  )
}

function CustomProviderCard({
  provider,
  t,
  onSaved,
}: {
  provider: StoredCustomProvider
  t: TFunc
  onSaved: () => void
}) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; model_count?: number; error?: string } | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleTest = useCallback(async () => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetcher(`/api/settings/custom-providers/${provider.id}/status`) as { ok: boolean; model_count?: number; error?: string }
      setTestResult(res)
    } catch {
      setTestResult({ ok: false, error: 'Request failed' })
    } finally {
      setTesting(false)
    }
  }, [testing, provider.id])

  useEffect(() => {
    void handleTest()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isConfigured = provider.configured
  const statusDotClass = !isConfigured
    ? 'bg-error'
    : testResult?.ok
      ? 'bg-success'
      : testResult
        ? 'bg-error'
        : 'bg-muted'
  const statusText = getCustomProviderStatusText(t, isConfigured, testResult, provider.models.length)

  async function handleDeleteConfirmed() {
    setIsDeleteDialogOpen(false)
    setDeleting(true)
    try {
      await apiDelete(`/api/settings/custom-providers/${provider.id}`)
      onSaved()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <CollapsibleCardWrapper
        header={<>
          <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass}`} />
        <span className="text-sm font-medium text-text truncate">{provider.name}</span>
        <span className="text-xs text-muted truncate">{statusText}</span>
        </>}
        actions={<>
          <IconBtn
            onClick={handleTest}
            disabled={testing}
            className="p-1 text-muted hover:text-text transition-colors disabled:opacity-50 select-none"
            title={t('custom.testConnection')}
          >
            <Zap size={13} className={testing ? 'animate-pulse' : ''} />
          </IconBtn>
          <IconBtn
            onClick={() => setIsDialogOpen(true)}
            title={t('custom.editProvider')}
            className="p-1 text-muted hover:text-text transition-colors select-none"
          >
            <Pencil size={13} />
          </IconBtn>
          <IconBtn
            onClick={() => setIsDeleteDialogOpen(true)}
            disabled={deleting}
            title={t('custom.deleteProvider')}
            className="p-1 text-muted/60 hover:text-error transition-colors disabled:opacity-50 select-none"
          >
            <Trash2 size={13} />
          </IconBtn>
        </>}
      >
        <div className="space-y-2 text-xs text-muted">
          <p className="truncate">{provider.baseUrl}</p>
          <div className="flex flex-wrap gap-1.5">
            {provider.models.map(model => (
              <span key={model} className="rounded-md bg-bg-subtle px-2 py-1 text-[11px] text-muted">
                {model}
              </span>
            ))}
          </div>
          <ProviderConnectionError
            testResult={testResult}
            label={t('custom.connectionFailed')}
          />
        </div>
      </CollapsibleCardWrapper>
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-sm border border-border/80">
          <DialogHeader>
            <DialogTitle className="text-text">{t('custom.deleteProvider')}</DialogTitle>
            <DialogDescription className="text-muted">
              {`${t('custom.deleteConfirm')} "${provider.name}"`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <button
              type="button"
              onClick={() => setIsDeleteDialogOpen(false)}
              className="px-3 py-1.5 text-sm rounded-lg border border-border text-text hover:bg-hover transition-colors"
            >
              {t('settings.cancel')}
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirmed}
              disabled={deleting}
              className="px-3 py-1.5 text-sm rounded-lg border border-error/50 text-error hover:bg-error/10 transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
            >
              {deleting ? t('settings.saving') : t('custom.deleteProvider')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CustomProviderDialog
        open={isDialogOpen}
        editTarget={provider}
        t={t}
        onClose={() => setIsDialogOpen(false)}
        onSaved={() => { onSaved(); setIsDialogOpen(false) }}
      />
    </>
  )
}

function CustomProviderDialog({
  open,
  editTarget,
  t,
  onClose,
  onSaved,
}: {
  open: boolean
  editTarget: StoredCustomProvider | null
  t: TFunc
  onClose: () => void
  onSaved: () => void
}) {
  const isEditing = !!editTarget

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('custom.editProvider') : t('custom.addProvider')}</DialogTitle>
          <DialogDescription>{t('custom.addDesc')}</DialogDescription>
        </DialogHeader>

          <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
            <CustomProviderForm
              mode="edit"
              t={t}
              provider={editTarget}
              open={open}
              onSaved={onSaved}
              onClose={onClose}
              renderActions={({ saving, handleSave }) => (
                <DialogFooter>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1.5 text-sm rounded-lg border border-border text-text hover:bg-hover transition-colors"
                  >
                    {t('settings.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="px-3 py-1.5 text-sm rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {saving ? t('settings.saving') : t('settings.save')}
                  </button>
                </DialogFooter>
              )}
            />
          </div>
      </DialogContent>
    </Dialog>
  )
}


function mergeModels(base: string[], additions: string[]) {
  const result: string[] = [...base]
  const exists = new Set(base)
  additions.forEach(item => {
    const model = item.trim()
    if (!model) return
    if (exists.has(model)) return
    result.push(model)
    exists.add(model)
  })
  return result
}

function getCustomProviderStatusText(
  t: TFunc,
  isConfigured: boolean,
  testResult: { ok: boolean } | null,
  modelCount: number,
) {
  if (!isConfigured) return t('chat.apiKeyNotSet')
  if (testResult && !testResult.ok) return ''
  return `${t('custom.connected')} (${modelCount} models)`
}

function AnthropicCard({
  t,
  onHideProvider,
  isHidable,
}: {
  t: TFunc
  onHideProvider?: (provider: string) => void
  isHidable?: boolean
}) {
  const { data: keyStatus, mutate: mutateKeyStatus } = useSWR<{ configured: boolean }>(
    '/api/settings/api-keys/anthropic',
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: prefs, mutate: mutatePrefs } = useSWR<Record<string, string | null>>(
    '/api/settings/preferences',
    fetcher,
    { revalidateOnFocus: false },
  )

  const savedBaseUrl = prefs?.['anthropic.base_url'] || ''
  const isConfigured = keyStatus?.configured

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!prefs || initialized) return
    setBaseUrlInput(prefs['anthropic.base_url'] || '')
    setInitialized(true)
  }, [prefs, initialized])

  const autoTested = useRef(false)
  useEffect(() => {
    if (autoTested.current || isConfigured === undefined) return
    if (!isConfigured) return
    autoTested.current = true
    void handleTest()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured])

  function showMessage(text: string, type: 'success' | 'error') {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleTest = useCallback(async () => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetcher('/api/settings/anthropic/status') as { ok: boolean; error?: string }
      setTestResult(res)
    } catch {
      setTestResult({ ok: false, error: 'Request failed' })
    } finally {
      setTesting(false)
    }
  }, [testing])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const promises: Promise<any>[] = []
      if (apiKeyInput) {
        promises.push(apiPost('/api/settings/api-keys/anthropic', { apiKey: apiKeyInput }))
      }
      if (baseUrlInput !== savedBaseUrl) {
        promises.push(apiPatch('/api/settings/preferences', { 'anthropic.base_url': baseUrlInput || '' }))
      }
      await Promise.all(promises)
      void mutateKeyStatus()
      void mutatePrefs()
      setApiKeyInput('')
      showMessage(t('anthropic.settingsSaved'), 'success')
      void handleTest()
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (saving) return
    setSaving(true)
    try {
      await Promise.all([
        apiPost('/api/settings/api-keys/anthropic', { apiKey: '' }),
        apiPatch('/api/settings/preferences', { 'anthropic.base_url': '' }),
      ])
      void mutateKeyStatus()
      void mutatePrefs()
      setApiKeyInput('')
      setBaseUrlInput('')
      setTestResult(null)
      showMessage(t('anthropic.apiKeyDeleted'), 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const hasChanges = !!apiKeyInput || baseUrlInput !== savedBaseUrl
  const dotClass = hasChanges ? 'bg-error' : testResult?.ok ? 'bg-success' : testResult ? 'bg-error' : 'bg-muted'
  const statusText = getProviderStatusText(t, 'anthropic', !!isConfigured, testResult)

  return (
    <CollapsibleCardWrapper
      header={<>
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-sm font-medium text-text">{t(PROVIDER_LABELS['anthropic'])}</span>
        <span className="text-xs text-muted">{statusText}</span>
      </>}
      actions={<>
        <IconBtn onClick={handleTest} disabled={testing}
          title={t('ollama.testConnection')}
          className="p-1 text-muted hover:text-text transition-colors disabled:opacity-50">
          <Zap size={13} className={testing ? 'animate-pulse' : ''} />
        </IconBtn>
        {isConfigured && (
          <IconBtn onClick={handleDelete} disabled={saving}
            title={t('chat.apiKeyDelete')} className="p-1 text-muted/60 hover:text-error transition-colors disabled:opacity-50">
            <RotateCcw size={13} />
          </IconBtn>
        )}
        {isHidable && onHideProvider && (
          <IconBtn onClick={() => onHideProvider('anthropic')}
            title={t('integration.removeProvider')}
            className="p-1 text-muted/60 hover:text-muted transition-colors">
            <EyeOff size={13} />
          </IconBtn>
        )}
      </>}
    >
      <FormField label={t('chat.apiKey')} compact>
        <Input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
          placeholder={isConfigured ? '••••••••' : 'sk-ant-...'} className="py-1.5" />
      </FormField>

      <FormField label={<span>{t('anthropic.baseUrl')} <span className="font-normal text-muted/70">({t('anthropic.baseUrlDesc')})</span></span>} compact>
        <Input type="text" value={baseUrlInput} onChange={e => setBaseUrlInput(e.target.value)}
          placeholder={t('anthropic.baseUrlPlaceholder')} className="py-1.5" />
      </FormField>

      {hasChanges && (
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none">
            {saving ? '...' : t('settings.save')}
          </button>
        </div>
      )}
      <ProviderConnectionError
        testResult={testResult}
        label={getProviderConnectionFailedLabel(t, 'anthropic')}
        as="span"
      />

      {message && <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>{message.text}</p>}
    </CollapsibleCardWrapper>
  )
}
