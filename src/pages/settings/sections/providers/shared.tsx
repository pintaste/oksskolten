import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { isMessageKey } from '../../../../lib/i18n'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

export type TFunc = (key: any, params?: Record<string, string>) => string

export type CustomApiFormat = 'openai' | 'anthropic'

export type StoredCustomProvider = {
  id: string
  name: string
  baseUrl: string
  models: string[]
  apiFormat: CustomApiFormat
  configured: boolean
}

export type CustomProviderFormMode = 'add' | 'edit'

export function getProviderConnectedLabel(t: TFunc, provider: string) {
  const connectedKey = `${provider}.connected`
  return isMessageKey(connectedKey) ? t(connectedKey) : ''
}

export function getProviderConnectionFailedLabel(t: TFunc, provider: string) {
  const failedKey = `${provider}.connectionFailed`
  return isMessageKey(failedKey) ? t(failedKey) : t('ollama.connectionFailed')
}

export function getProviderStatusText(
  t: TFunc,
  provider: string,
  isConfigured: boolean,
  testResult: { ok: boolean } | null,
) {
  if (!isConfigured) return t('chat.apiKeyNotSet')
  if (!testResult) return getProviderConnectedLabel(t, provider)
  return testResult.ok ? getProviderConnectedLabel(t, provider) : t('chat.apiKeyNotSet')
}

export function mergeModels(base: string[], additions: string[]) {
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

export function getCustomProviderStatusText(
  t: TFunc,
  isConfigured: boolean,
  testResult: { ok: boolean } | null,
  modelCount: number,
) {
  if (!isConfigured) return t('chat.apiKeyNotSet')
  if (testResult && !testResult.ok) return ''
  return `${t('custom.connected')} (${modelCount} models)`
}

export function ProviderConnectionError({
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

export function IconBtn({ onClick, title, disabled, children, className }: {
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

export function CollapsibleCardWrapper({
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
