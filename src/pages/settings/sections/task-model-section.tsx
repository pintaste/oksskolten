import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '../../../lib/fetcher'
import {
  ANTHROPIC_MODELS,
  GEMINI_MODELS,
  OPENAI_MODELS,
  DEEPSEEK_MODELS,
  DEFAULT_MODELS,
  PROVIDER_LABELS,
  LLM_API_PROVIDERS,
  TRANSLATE_SERVICE_PROVIDERS,
  LLM_TASK_PROVIDERS,
} from '../../../data/aiModels'
import type { ModelGroup } from '../../../data/aiModels'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectLabel, SelectItem } from '@/components/ui/select'
import type { Settings } from '../../../hooks/use-settings'
import type { TranslateFn } from '../../../lib/i18n'
import { isMessageKey } from '../../../lib/i18n'
import { Languages, MessageCircle, ChevronDown, NotebookText } from 'lucide-react'
import { RadioGroup } from '@/components/ui/radio-group'

type StoredCustomProvider = { id: string; name: string; baseUrl: string; models: string[]; configured: boolean }

type TFunc = TranslateFn
type MessageKey = Parameters<TFunc>[0]

interface TaskConfig {
  labelKey: MessageKey
  providerValue: string
  setProvider: (v: string) => void
  modelValue: string
  setModel: (v: string) => void
  defaultModel: string
  hasTranslateServices?: boolean
  autoValue?: 'on' | 'off'
  setAuto?: (v: 'on' | 'off') => void
  autoLabelKey?: MessageKey
  autoOnKey?: MessageKey
  autoOffKey?: MessageKey
  titleAutoValue?: 'on' | 'off'
  setTitleAuto?: (v: 'on' | 'off') => void
  targetLangValue?: string | null
  setTargetLang?: (v: string) => void
}

const SWR_KEY_OPTS = { revalidateOnFocus: false } as const

export function TaskModelSection({ settings, t, hiddenProviders }: { settings: Settings; t: TFunc; hiddenProviders: string[] }) {
  // Call useSWR at top level for each provider (hooks must not be called in loops)
  const anthropicKey = useSWR<{ configured: boolean }>(`/api/settings/api-keys/anthropic`, fetcher, SWR_KEY_OPTS)
  const geminiKey = useSWR<{ configured: boolean }>(`/api/settings/api-keys/gemini`, fetcher, SWR_KEY_OPTS)
  const openaiKey = useSWR<{ configured: boolean }>(`/api/settings/api-keys/openai`, fetcher, SWR_KEY_OPTS)
  const deepseekKey = useSWR<{ configured: boolean }>(`/api/settings/api-keys/deepseek`, fetcher, SWR_KEY_OPTS)
  const mimoKey = useSWR<{ configured: boolean }>(`/api/settings/api-keys/mimo`, fetcher, SWR_KEY_OPTS)
  const customPrefs = useSWR<Record<string, string | null>>('/api/settings/preferences', fetcher, SWR_KEY_OPTS)
  const { data: customProvidersList } = useSWR<{ providers: StoredCustomProvider[] }>(
    '/api/settings/custom-providers', fetcher, SWR_KEY_OPTS,
  )
  const googleTranslateKey = useSWR<{ configured: boolean }>(`/api/settings/api-keys/google-translate`, fetcher, SWR_KEY_OPTS)
  const deeplKey = useSWR<{ configured: boolean }>(`/api/settings/api-keys/deepl`, fetcher, SWR_KEY_OPTS)
  const googleTranslateStatus = useSWR<{ ok: boolean }>(`/api/settings/google-translate/status`, fetcher, SWR_KEY_OPTS)
  const deeplStatus = useSWR<{ ok: boolean }>(`/api/settings/deepl/status`, fetcher, SWR_KEY_OPTS)
  const { data: claudeCodeStatus } = useSWR<{ loggedIn?: boolean; error?: string }>(
    '/api/chat/claude-code-status', fetcher, SWR_KEY_OPTS,
  )

  const llmKeyStatuses = [anthropicKey, geminiKey, openaiKey, deepseekKey, mimoKey]
  const translateKeyStatuses = [googleTranslateKey, deeplKey]

  const claudeCodeReady = !!claudeCodeStatus?.loggedIn
  const hiddenProviderSet = useMemo(() => new Set(hiddenProviders), [hiddenProviders])

  // Custom-* providers from the registry
  const customProviders = useMemo(
    () => customProvidersList?.providers || [],
    [customProvidersList],
  )
  const customProvidersLoading = customProvidersList === undefined
  const customProviderNames = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of customProviders) map[p.id] = p.name
    return map
  }, [customProviders])
  const customModelsRaw = customPrefs.data?.['custom.models']
  const customBaseUrl = customPrefs.data?.['custom.base_url']

  const visibleLlmProviders = useMemo(() => {
    // Exclude legacy 'custom' (replaced by custom-* providers)
    const base = LLM_TASK_PROVIDERS.filter(p => p !== 'custom' && !hiddenProviderSet.has(p))
    // Append custom-* providers that have at least one model
    const customIds = customProviders.filter(p => p.models.length > 0).map(p => p.id)
    return [...base, ...customIds]
  }, [hiddenProviderSet, customProviders])

  const customModels = useMemo(
    () => parseCustomModels(customModelsRaw),
    [customModelsRaw],
  )

  const configuredKeys = useMemo(() => {
    const map: Record<string, boolean> = {}
    LLM_API_PROVIDERS.forEach((p, i) => { map[p] = !!llmKeyStatuses[i].data?.configured })
    TRANSLATE_SERVICE_PROVIDERS.forEach((p, i) => {
      const hasKey = !!translateKeyStatuses[i].data?.configured
      const statusOk = p === 'google-translate'
        ? googleTranslateStatus.data?.ok
        : deeplStatus.data?.ok
      map[p] = hasKey && statusOk !== false
    })
    map['claude-code'] = claudeCodeReady
    map['ollama'] = true  // Ollama requires no API key; always available
    map['vllm'] = true    // vLLM requires no API key by default; always available
    map['custom'] = !!(customBaseUrl && customModels.length > 0)
    // Custom-* providers: configured if they have models
    for (const p of customProviders) {
      map[p.id] = p.models.length > 0
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    anthropicKey.data?.configured, geminiKey.data?.configured, openaiKey.data?.configured,
    deepseekKey.data?.configured, mimoKey.data?.configured,
    customBaseUrl, customModels,
    googleTranslateKey.data?.configured, deeplKey.data?.configured, claudeCodeReady,
    googleTranslateStatus.data?.ok, deeplStatus.data?.ok,
    customProviders,
  ])
  // Ollama/vLLM requires no API key, so the task section is always enabled when they are available.
  const visibleConfiguredLlmProviders = useMemo(
    () => visibleLlmProviders.filter(p => configuredKeys[p]),
    [visibleLlmProviders, configuredKeys],
  )
  const connectedTranslateProviders = useMemo(
    () => TRANSLATE_SERVICE_PROVIDERS.filter(p => configuredKeys[p]),
    [configuredKeys],
  )
  const hasAnyLlmKey = visibleConfiguredLlmProviders.length > 0
  const hasAnyTranslateKey = connectedTranslateProviders.length > 0
  const hasAnyKey = hasAnyLlmKey || hasAnyTranslateKey
  const keysLoading = llmKeyStatuses.some(s => !s.data) || translateKeyStatuses.some(s => !s.data)
    const {
      setChatProvider,
      setSummaryProvider,
      setTranslateProvider,
      summaryAuto,
      setSummaryAuto,
      translateAuto,
      setTranslateAuto,
      translateTitleAuto,
      setTranslateTitleAuto,
    } = settings

  useEffect(() => {
    if (!isTranslateService(settings.chatProvider || '') && hiddenProviderSet.has(settings.chatProvider || '')) {
      setChatProvider('')
    }
    if (!isTranslateService(settings.summaryProvider || '') && hiddenProviderSet.has(settings.summaryProvider || '')) {
      setSummaryProvider('')
    }
    if (!isTranslateService(settings.translateProvider || '') && hiddenProviderSet.has(settings.translateProvider || '')) {
      setTranslateProvider('')
    }
  }, [hiddenProviderSet, setChatProvider, setSummaryProvider, setTranslateProvider, settings.chatProvider, settings.summaryProvider, settings.translateProvider])

  const tasks: TaskConfig[] = [
    {
      labelKey: 'integration.task.chat',
      providerValue: settings.chatProvider || '',
          setProvider: (v) => {
            settings.setChatProvider(v)
            if (v !== 'ollama' && v !== 'vllm' && v !== 'mimo' && v !== 'custom' && !v.startsWith('custom-')) settings.setChatModel(DEFAULT_MODELS[v] || DEFAULT_MODELS.anthropic)
            else settings.setChatModel('')
          },
      modelValue: settings.chatModel || '',
      setModel: settings.setChatModel,
      defaultModel: 'claude-haiku-4-5-20251001',
    },
    {
      labelKey: 'integration.task.summary',
      providerValue: settings.summaryProvider || '',
      setProvider: (v) => {
        settings.setSummaryProvider(v)
        if (v !== 'ollama' && v !== 'vllm' && v !== 'mimo' && v !== 'custom' && !v.startsWith('custom-')) settings.setSummaryModel(DEFAULT_MODELS[v] || DEFAULT_MODELS.anthropic)
        else settings.setSummaryModel('')
      },
      modelValue: settings.summaryModel || '',
      setModel: settings.setSummaryModel,
      defaultModel: 'claude-haiku-4-5-20251001',
      autoValue: summaryAuto === 'on' ? 'on' : 'off',
      setAuto: setSummaryAuto,
      targetLangValue: settings.summaryTargetLang,
      setTargetLang: settings.setSummaryTargetLang,
    },
    {
      labelKey: 'integration.task.translate',
      providerValue: settings.translateProvider || '',
      setProvider: (v) => {
        settings.setTranslateProvider(v)
        if (v !== 'ollama' && v !== 'vllm' && v !== 'mimo' && v !== 'custom' && !v.startsWith('custom-')) settings.setTranslateModel(DEFAULT_MODELS[v] || DEFAULT_MODELS.anthropic)
        else settings.setTranslateModel('')
      },
      modelValue: settings.translateModel || '',
      setModel: settings.setTranslateModel,
      defaultModel: 'claude-sonnet-4-6',
      hasTranslateServices: true,
      autoValue: translateAuto === 'on' ? 'on' : 'off',
      setAuto: setTranslateAuto,
      autoLabelKey: 'translate.auto',
      autoOnKey: 'translate.autoOn',
      autoOffKey: 'translate.autoOff',
      titleAutoValue: translateTitleAuto === 'on' ? 'on' : 'off',
      setTitleAuto: setTranslateTitleAuto,
      targetLangValue: settings.translateTargetLang,
      setTargetLang: settings.setTranslateTargetLang,
    },
  ]

  // Show brief "Saved" feedback on any task provider/model change
  const [showSaved, setShowSaved] = useState(false)
  const prevValues = useRef(tasks.map(t => `${t.providerValue}:${t.modelValue}`).join('|'))
  const currentValues = tasks.map(t => `${t.providerValue}:${t.modelValue}`).join('|')
  useEffect(() => {
    if (prevValues.current !== currentValues) {
      prevValues.current = currentValues
      setShowSaved(true)
      const timer = setTimeout(() => setShowSaved(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [currentValues])

  return (
    <section className="space-y-2">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-text">{t('integration.taskSettings')}</h2>
          <span
            className={`text-xs text-accent transition-opacity duration-300 ${
              showSaved ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {t('settings.saved')}
          </span>
        </div>
        <p className="text-xs text-muted mt-1">{t('integration.taskSettingsDesc')}</p>
      </div>
      <div className={`${!keysLoading && !hasAnyKey ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="space-y-1.5">
          {tasks.map(task => (
            <TaskModelRow
              key={task.labelKey}
              task={task}
              t={t}
              configuredKeys={configuredKeys}
              hasAnyTranslateKey={hasAnyTranslateKey}
              connectedTranslateProviders={connectedTranslateProviders}
              visibleLlmProviders={visibleConfiguredLlmProviders}
              customModels={customModels}
              customProviders={customProviders}
              customProvidersLoading={customProvidersLoading}
              customProviderNames={customProviderNames}
            />
          ))}
        </div>
      </div>
      {!keysLoading && !hasAnyKey && (
        <p className="text-sm text-muted">{t('integration.taskSettingsNoKeys')}</p>
      )}
    </section>
  )
}

/* ── Helpers ── */

function LangRadioRow({ label, value, onChange, autoLabel, t }: {
  label: string
  value: string
  onChange: (v: string) => void
  autoLabel: string
  t: TFunc
}) {
  const opts = [
    { value: '', label: autoLabel },
    { value: 'ja', label: t('settings.languageJa') },
    { value: 'en', label: t('settings.languageEn') },
    { value: 'zh', label: t('settings.languageZh') },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5" role="radiogroup" aria-label={label || undefined}>
        {opts.map(opt => {
          const selected = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              className={`flex min-w-fit h-7 items-center gap-2 rounded-md px-2 py-0.5 text-xs font-medium leading-none transition-colors select-none ${selected ? 'text-text' : 'text-muted hover:text-text'}`}
            >
              <span className={`relative h-[18px] w-[18px] rounded-full border-2 shrink-0 ${selected ? 'border-accent' : 'border-muted/40'}`}>
                {selected && <span className="absolute inset-1 rounded-full bg-accent" />}
              </span>
              <span className="whitespace-nowrap">{opt.label}</span>
            </button>
          )
        })}
    </div>
  )
}

function getModelGroups(provider: string): ModelGroup[] {
  if (provider === 'anthropic') return ANTHROPIC_MODELS
  if (provider === 'gemini') return GEMINI_MODELS
  if (provider === 'openai') return OPENAI_MODELS
  if (provider === 'deepseek') return DEEPSEEK_MODELS
  if (provider === 'claude-code') return ANTHROPIC_MODELS
  return []
}

function parseCustomModels(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item): item is string => item.length > 0)
  } catch {
    return []
  }
}

function isTranslateService(provider: string): boolean {
  return (TRANSLATE_SERVICE_PROVIDERS as readonly string[]).includes(provider)
}

function getProviderLabel(
  t: TFunc,
  provider: string,
  customProviderNames?: Record<string, string>,
) {
  if (!provider) return t('chat.apiKeyNotSet')
  const labelKey = PROVIDER_LABELS[provider]
  return customProviderNames?.[provider] || (labelKey && isMessageKey(labelKey) ? t(labelKey) : provider)
}

/* ── Task Model Row ── */

function TaskModelRow({
  task,
  t,
  configuredKeys,
  hasAnyTranslateKey,
  connectedTranslateProviders,
  visibleLlmProviders,
  customModels,
  customProviders,
  customProvidersLoading,
  customProviderNames,
}: {
  task: TaskConfig
  t: TFunc
  configuredKeys: Record<string, boolean>
  hasAnyTranslateKey: boolean
  connectedTranslateProviders: string[]
  visibleLlmProviders: string[]
  customModels: string[]
  customProviders: StoredCustomProvider[]
  customProvidersLoading: boolean
  customProviderNames: Record<string, string>
}) {
  const hasTranslateServices = !!task.hasTranslateServices
  const currentIsTranslateService = isTranslateService(task.providerValue)
  const hasAuto = task.setAuto !== undefined
  const hasTitleAuto = task.setTitleAuto !== undefined
  const hasTargetLang = task.setTargetLang !== undefined
  const autoLabelKey: MessageKey = task.autoLabelKey ?? 'summary.auto'
  const autoOnKey: MessageKey = task.autoOnKey ?? 'summary.autoOn'
  const autoOffKey: MessageKey = task.autoOffKey ?? 'summary.autoOff'

  const Icon = task.labelKey === 'integration.task.chat'
    ? MessageCircle
    : task.labelKey === 'integration.task.summary'
      ? NotebookText
      : Languages

  const providerOptions = useMemo(() => {
    const options = currentIsTranslateService
      ? [...connectedTranslateProviders]
      : [...visibleLlmProviders]
    if (task.providerValue && !options.includes(task.providerValue) && !currentIsTranslateService) {
      options.push(task.providerValue)
    }
    return options
  }, [connectedTranslateProviders, currentIsTranslateService, task.providerValue, visibleLlmProviders])
  const hasProviderValue = task.providerValue !== ''
  const defaultLlmProvider = visibleLlmProviders.find(p => configuredKeys[p]) || visibleLlmProviders[0]
  const defaultTranslateProvider = connectedTranslateProviders[0]
  const providerLabel = getProviderLabel(t, task.providerValue, customProviderNames)
  const providerConfigured = task.providerValue ? configuredKeys[task.providerValue] : false
  const isMissingProviderConfig = !task.providerValue || !providerConfigured
  const autoSetting: 'on' | 'off' = task.autoValue === 'on' ? 'on' : 'off'
  const summaryText = !hasProviderValue
    ? t('chat.apiKeyNotSet')
    : `${providerLabel} · ${isMissingProviderConfig ? t('chat.apiKeyNotSet') : (task.modelValue || t('chat.apiKeyNotSet'))}`
  const [collapsed, setCollapsed] = useState(true)

  return (
    <section className="rounded-lg border border-border bg-bg-card overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full select-none"
      >
        <div className="flex items-start gap-2 px-2.5 py-2">
          <span className="text-muted mt-0.5 shrink-0"><Icon size={16} strokeWidth={1.8} /></span>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-semibold text-text truncate">{t(task.labelKey)}</div>
          <div className="text-xs text-muted mt-0.5 truncate">{summaryText}</div>
        </div>
          <ChevronDown
            size={14}
            className={`mt-0.5 text-muted shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          />
        </div>
      </button>
      <div className={`px-2.5 pb-2 pt-1.5 border-t border-border space-y-2 ${collapsed ? 'hidden' : ''}`}>
        {hasAuto && (
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
              {t(autoLabelKey)}
            </div>
            <RadioGroup
              name={`${task.labelKey}-auto`}
              options={[
                { value: 'on', label: t(autoOnKey) },
                { value: 'off', label: t(autoOffKey) },
              ]}
              className="flex items-center gap-3"
              optionClassName="flex items-center gap-2.5 cursor-pointer py-1"
              value={autoSetting}
              onChange={task.setAuto ?? (() => {})}
            />
          </div>
        )}
        {hasTitleAuto && (
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
              {t('translate.titleAuto')}
            </div>
            <RadioGroup
              name={`${task.labelKey}-title-auto`}
              options={[
                { value: 'on', label: t('translate.titleAutoOn') },
                { value: 'off', label: t('translate.titleAutoOff') },
              ]}
              className="flex items-center gap-3"
              optionClassName="flex items-center gap-2.5 cursor-pointer py-1"
              value={task.titleAutoValue ?? 'off'}
              onChange={task.setTitleAuto ?? (() => {})}
            />
          </div>
        )}
        {hasTargetLang && (
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
              {task.labelKey === 'integration.task.translate' ? t('settings.translateTargetLang') : t('settings.summaryTargetLang')}
            </div>
            <LangRadioRow
              label=""
              value={task.targetLangValue || ''}
              onChange={task.setTargetLang!}
              autoLabel={t('settings.translateTargetLangAuto')}
              t={t}
            />
          </div>
        )}
        {hasTranslateServices && (
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
              {t('integration.column.mode' as MessageKey)}
            </div>
            <ModeSelect
              t={t}
              isLlm={!currentIsTranslateService}
              hasAnyTranslateKey={hasAnyTranslateKey}
              onLlm={() => {
                if (!hasProviderValue || currentIsTranslateService) {
                  if (defaultLlmProvider) task.setProvider(defaultLlmProvider)
                }
              }}
              onService={() => {
                if (hasAnyTranslateKey && (!hasProviderValue || !currentIsTranslateService) && defaultTranslateProvider) {
                  task.setProvider(defaultTranslateProvider)
                }
              }}
            />
          </div>
        )}
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
            {t('integration.column.provider' as MessageKey)}
          </div>
        <ProviderSelectField
            providers={providerOptions}
            selected={task.providerValue}
            onSelect={task.setProvider}
            t={t}
            configuredKeys={configuredKeys}
            customProviderNames={customProviderNames}
            emptyPlaceholder={hasTranslateServices ? t('chat.apiKeyNotSet') : undefined}
            showMissingNotice={isMissingProviderConfig && hasTranslateServices}
          />
        </div>
        {hasTranslateServices && isMissingProviderConfig && (
          <div className="text-xs text-error">{t('chat.apiKeyNotSet')}</div>
        )}
        {!currentIsTranslateService && (
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">{t('integration.column.model' as MessageKey)}</div>
            <ModelSelect
              provider={task.providerValue}
              modelValue={task.modelValue}
              setModel={task.setModel}
              t={t}
              customModels={customModels}
              customProviders={customProviders}
              customProvidersLoading={customProvidersLoading}
            />
          </div>
        )}
      </div>
    </section>
  )
}

/* ── Shared sub-components ── */

function ModeSelect({
  t,
  isLlm,
  hasAnyTranslateKey,
  onLlm,
  onService,
}: {
  t: TFunc
  isLlm: boolean
  hasAnyTranslateKey: boolean
  onLlm: () => void
  onService: () => void
}) {
  return (
    <div className="grid h-7 grid-cols-2 gap-1.5">
      <button
        type="button"
        onClick={onLlm}
        className={`h-7 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
          isLlm
            ? 'border-accent bg-accent/10 text-text'
            : 'border-border bg-bg-subtle text-muted hover:bg-hover'
        }`}
      >
        <span className="truncate block leading-none">{t('integration.modeLLM')}</span>
      </button>
      <button
        type="button"
        disabled={!hasAnyTranslateKey}
        onClick={onService}
        className={`h-7 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
          !isLlm
            ? 'border-accent bg-accent/10 text-text'
            : 'border-border bg-bg-subtle text-muted hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50'
        }`}
      >
        <span className="truncate block leading-none">{t('integration.modeTranslateService')}</span>
      </button>
    </div>
  )
}

function ProviderSelectField({
  providers,
  selected,
  onSelect,
  t,
  configuredKeys,
  customProviderNames,
  emptyPlaceholder,
  showMissingNotice,
}: {
  providers: readonly string[]
  selected: string
  onSelect: (v: string) => void
  t: TFunc
  configuredKeys: Record<string, boolean>
  customProviderNames?: Record<string, string>
  emptyPlaceholder?: string
  showMissingNotice?: boolean
}) {
  const selectedValue = providers.includes(selected) ? selected : ''
  const showNotice = !!showMissingNotice && !providers.includes(selected)
  const placeholderText = showNotice || !providers.length
    ? (emptyPlaceholder || t('chat.apiKeyNotSet'))
    : t('integration.selectProviderFirst')

  if (providers.length === 0 || showNotice) {
    return (
      <Select value={selectedValue || undefined} onValueChange={onSelect} disabled={providers.length === 0}>
        <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-bg-subtle px-2.5 text-xs font-medium hover:bg-hover focus:border-accent">
          <SelectValue placeholder={placeholderText} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {providers.map(p => {
              const isConfigured = !!configuredKeys[p]
              const isSelected = p === selected
              const labelKey = PROVIDER_LABELS[p]
              const label = customProviderNames?.[p] ?? (labelKey && isMessageKey(labelKey) ? t(labelKey) : p)
              return (
                <SelectItem key={p} value={p} disabled={!isConfigured && !isSelected}>
                  {label}
                </SelectItem>
              )
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
    )
  }

  return (
    <Select value={selectedValue} onValueChange={onSelect}>
      <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-bg-subtle px-2.5 text-xs font-medium hover:bg-hover focus:border-accent">
        <SelectValue placeholder={placeholderText} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {providers.map(p => {
            const isConfigured = !!configuredKeys[p]
            const isSelected = p === selected
            const labelKey = PROVIDER_LABELS[p]
            const label = customProviderNames?.[p] ?? (labelKey && isMessageKey(labelKey) ? t(labelKey) : p)
            return (
              <SelectItem key={p} value={p} disabled={!isConfigured && !isSelected}>
                {label}
              </SelectItem>
            )
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function ModelSelect({
  provider,
  modelValue,
  setModel,
  t,
  customModels,
  customProviders,
  customProvidersLoading,
}: {
  provider: string
  modelValue: string
  setModel: (v: string) => void
  t: TFunc
  customModels: string[]
  customProviders?: StoredCustomProvider[]
  customProvidersLoading: boolean
}) {
  // Ollama: fetch dynamic model list
  const { data: ollamaModels } = useSWR<{ models: Array<{ name: string; size: number; parameter_size: string }> }>(
    provider === 'ollama' ? '/api/settings/ollama/models' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  // vLLM: fetch dynamic model list
  const { data: vllmModels } = useSWR<{ models: Array<{ name: string }> }>(
    provider === 'vllm' ? '/api/settings/vllm/models' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  // DeepSeek: fetch dynamic model list
  const { data: deepseekModels } = useSWR<{ models: Array<{ name: string }> }>(
    provider === 'deepseek' ? '/api/settings/deepseek/models' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  // Mimo: fetch dynamic model list
  const { data: mimoModels } = useSWR<{ models: Array<{ name: string }> }>(
    provider === 'mimo' ? '/api/settings/mimo/models' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const savedCustomModels = useMemo(() => provider === 'custom' ? customModels : [], [provider, customModels])
  const isCustomProvider = provider.startsWith('custom-')

  const customProviderModels = useMemo(() => {
    if (!isCustomProvider || customProvidersLoading || !customProviders) return undefined
    return customProviders.find(p => p.id === provider)?.models || []
  }, [customProviders, customProvidersLoading, isCustomProvider, provider])

  const staticModelValues = useMemo(() => {
    const groups = getModelGroups(provider)
    return groups.flatMap(group => group.models.map(model => model.value))
  }, [provider])

  const availableModelValues = useMemo(() => {
    if (provider === 'ollama') {
      return ollamaModels?.models?.map(model => model.name)
    }
    if (provider === 'vllm') {
      return vllmModels?.models?.map(model => model.name)
    }
    if (provider === 'deepseek') {
      const deepseekNames = deepseekModels?.models?.map(model => model.name)
      return deepseekNames?.length ? deepseekNames : undefined
    }
    if (provider === 'mimo') {
      return mimoModels?.models?.map(model => model.name)
    }
    if (provider === 'custom') {
      return savedCustomModels
    }
    if (isCustomProvider) {
      return customProviderModels
    }
    return staticModelValues
  }, [
    provider,
    ollamaModels?.models,
    vllmModels?.models,
    deepseekModels?.models,
    mimoModels?.models,
    staticModelValues,
    savedCustomModels,
    customProviderModels,
    isCustomProvider,
  ])

  // Auto-select first model when a provider is chosen and model is still empty.
  // Keep persisted/explicit models intact even if they are not currently discoverable.
  useEffect(() => {
    if (!provider || modelValue) return
    if (!availableModelValues || availableModelValues.length === 0) return
    setModel(availableModelValues[0])
  }, [availableModelValues, modelValue, provider, setModel])

  if (!provider) {
    return (
      <Select disabled>
        <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-bg-subtle px-2.5 text-xs font-medium hover:bg-hover focus:border-accent">
          <SelectValue placeholder={t('integration.selectProviderFirst')} />
        </SelectTrigger>
        <SelectContent />
      </Select>
    )
  }

  if (provider === 'ollama') {
    const models = ollamaModels?.models || []
    if (models.length === 0) {
      return (
        <Select disabled>
          <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-bg-subtle px-2.5 text-xs font-medium hover:bg-hover focus:border-accent">
            <SelectValue placeholder={t('ollama.noModels')} />
          </SelectTrigger>
          <SelectContent />
        </Select>
      )
    }
    return (
      <Select value={modelValue || undefined} onValueChange={setModel}>
        <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-bg-subtle px-2.5 text-xs font-medium hover:bg-hover focus:border-accent">
          <SelectValue placeholder={t('integration.selectModel')} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {models.map(m => (
              <SelectItem key={m.name} value={m.name}>
                {m.name}{m.parameter_size ? ` (${m.parameter_size})` : ''}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    )
  }

  if (provider === 'vllm') {
    const models = vllmModels?.models || []
    if (models.length === 0) {
      return (
        <Select disabled>
          <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-bg-subtle px-2.5 text-xs font-medium hover:bg-hover focus:border-accent">
            <SelectValue placeholder={t('vllm.noModels')} />
          </SelectTrigger>
          <SelectContent />
        </Select>
      )
    }
    return (
      <Select value={modelValue || undefined} onValueChange={setModel}>
        <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-bg-subtle px-2.5 text-xs font-medium hover:bg-hover focus:border-accent">
          <SelectValue placeholder={t('integration.selectModel')} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {models.map(m => (
              <SelectItem key={m.name} value={m.name}>
                {m.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    )
  }

  if (provider === 'deepseek') {
    const models = deepseekModels?.models || []
    if (models.length === 0) {
      // Fallback to static DEEPSEEK_MODELS when no dynamic models
      return (
        <Select value={modelValue || undefined} onValueChange={setModel}>
          <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-bg-subtle px-2.5 text-xs font-medium hover:bg-hover focus:border-accent">
            <SelectValue placeholder={t('integration.selectModel')} />
          </SelectTrigger>
          <SelectContent>
            {DEEPSEEK_MODELS.map(group => (
              <SelectGroup key={group.group}>
                <SelectLabel>{group.group}</SelectLabel>
                {group.models.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label} ({m.value})</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      )
    }
    return (
      <Select value={modelValue || undefined} onValueChange={setModel}>
        <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-bg-subtle px-2.5 text-xs font-medium hover:bg-hover focus:border-accent">
          <SelectValue placeholder={t('integration.selectModel')} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {models.map(m => (
              <SelectItem key={m.name} value={m.name}>
                {m.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    )
  }

  if (provider === 'mimo') {
    const models = mimoModels?.models || []
    if (models.length === 0) {
      return (
        <Select disabled>
          <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-bg-subtle px-2.5 text-xs font-medium hover:bg-hover focus:border-accent">
            <SelectValue placeholder={t('mimo.noModels')} />
          </SelectTrigger>
          <SelectContent />
        </Select>
      )
    }
    return (
      <Select value={modelValue || undefined} onValueChange={setModel}>
        <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-bg-subtle px-2.5 text-xs font-medium hover:bg-hover focus:border-accent">
          <SelectValue placeholder={t('integration.selectModel')} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {models.map(m => (
              <SelectItem key={m.name} value={m.name}>
                {m.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    )
  }

  if (isCustomProvider) {
    if (customProviderModels === undefined) {
      return (
        <Select disabled>
          <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-bg-subtle px-2.5 text-xs font-medium hover:bg-hover focus:border-accent">
            <SelectValue placeholder={t('integration.selectModel')} />
          </SelectTrigger>
          <SelectContent />
        </Select>
      )
    }

    if (customProviderModels.length === 0) {
      return (
        <Select disabled>
          <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-bg-subtle px-2.5 text-xs font-medium hover:bg-hover focus:border-accent">
            <SelectValue placeholder={t('custom.noModels')} />
          </SelectTrigger>
          <SelectContent />
        </Select>
      )
    }
    return (
      <Select value={modelValue || undefined} onValueChange={setModel}>
        <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-bg-subtle px-2.5 text-xs font-medium hover:bg-hover focus:border-accent">
          <SelectValue placeholder={t('integration.selectModel')} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {customProviderModels.map(model => (
              <SelectItem key={model} value={model}>{model}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    )
  }

  if (provider === 'custom') {
    if (savedCustomModels.length === 0) {
      return (
        <Select disabled>
          <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-bg-subtle px-2.5 text-xs font-medium hover:bg-hover focus:border-accent">
            <SelectValue placeholder={t('custom.noModels')} />
          </SelectTrigger>
          <SelectContent />
        </Select>
      )
    }
    return (
      <Select value={modelValue || undefined} onValueChange={setModel}>
        <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-bg-subtle px-2.5 text-xs font-medium hover:bg-hover focus:border-accent">
          <SelectValue placeholder={t('integration.selectModel')} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {savedCustomModels.map(model => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    )
  }

  return (
    <Select value={modelValue || undefined} onValueChange={setModel}>
      <SelectTrigger className="h-7 w-full rounded-md border-transparent bg-bg-subtle px-2.5 text-xs font-medium hover:bg-hover focus:border-accent">
        <SelectValue placeholder={t('integration.selectModel')} />
      </SelectTrigger>
      <SelectContent>
        {getModelGroups(provider).map(group => (
          <SelectGroup key={group.group}>
            <SelectLabel>{group.group}</SelectLabel>
            {group.models.map(m => (
              <SelectItem key={m.value} value={m.value}>{m.label} ({m.value})</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
