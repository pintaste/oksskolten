import { useState } from 'react'
import useSWR from 'swr'
import { Copy, Check } from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import { Input } from '../ui/input'
import { fetcher, apiPatch } from '../../lib/fetcher'

interface FeverConfig {
  enabled: boolean
  username: string
  configured: boolean
}

export function FeverSettings() {
  const { t } = useI18n()
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const { data: config, mutate } = useSWR<FeverConfig>('/api/settings/fever', fetcher)

  const [username, setUsername] = useState<string | null>(null)
  const [password, setPassword] = useState('')

  const displayUsername = username ?? config?.username ?? ''
  const endpointUrl = `${window.location.origin}/api/fever`

  if (!config) return null

  function showMessage(msg: string, type: 'error' | 'success') {
    if (type === 'error') {
      setError(msg)
      setSuccess(null)
    } else {
      setSuccess(msg)
      setError(null)
    }
    setTimeout(() => { setError(null); setSuccess(null) }, 3000)
  }

  async function handleSave() {
    if (saving || !displayUsername.trim() || !password) return
    setSaving(true)
    try {
      await apiPatch('/api/settings/fever', { username: displayUsername.trim(), password })
      void mutate()
      setUsername(null)
      setPassword('')
      showMessage(t('settings.feverSaved'), 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle() {
    if (toggling || !config) return
    setToggling(true)
    try {
      await apiPatch('/api/settings/fever', { enabled: !config.enabled })
      void mutate()
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Toggle failed', 'error')
    } finally {
      setToggling(false)
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(endpointUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isDirty = username !== null || password !== ''

  return (
    <section>
      <h2 className="text-base font-semibold text-text mb-4">{t('settings.fever')}</h2>
      <p className="text-xs text-muted mb-4">{t('settings.feverDesc')}</p>

      <div className="space-y-3">
        {/* Username */}
        <div>
          <label className="block text-xs text-muted mb-1 select-none">{t('settings.feverUsername')}</label>
          <Input
            type="text"
            value={displayUsername}
            onChange={e => setUsername(e.target.value)}
            autoComplete="off"
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs text-muted mb-1 select-none">{t('settings.feverPassword')}</label>
          <Input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={config.configured ? '••••••••' : ''}
            autoComplete="new-password"
          />
        </div>

        {/* Save button */}
        {isDirty && (
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !displayUsername.trim() || !password}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none"
          >
            {saving ? '...' : t('settings.feverSave')}
          </button>
        )}
      </div>

      {/* Toggle + endpoint — only show when configured */}
      {config.configured && (
        <div className="mt-5 space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              role="switch"
              aria-checked={config.enabled}
              onClick={() => void handleToggle()}
              disabled={toggling}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                config.enabled ? 'bg-accent' : 'bg-border'
              } disabled:opacity-50`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  config.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm text-text select-none">
              {config.enabled ? 'On' : 'Off'}
            </span>
          </label>

          {config.enabled && (
            <div>
              <p className="text-xs text-muted mb-1 select-none">{t('settings.feverEndpoint')}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-bg-card border border-border rounded px-3 py-2 text-text select-all break-all">
                  {endpointUrl}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="shrink-0 p-2 rounded-lg text-muted hover:text-text hover:bg-hover transition-colors select-none"
                >
                  {copied ? <Check size={16} className="text-accent" /> : <Copy size={16} />}
                </button>
              </div>
              <p className="text-xs text-muted mt-2">{t('settings.feverEndpointHint')}</p>
            </div>
          )}
        </div>
      )}

      {!config.configured && (
        <p className="mt-3 text-xs text-muted">{t('settings.feverNotConfigured')}</p>
      )}

      {/* Messages */}
      {error && <p className="mt-3 text-sm text-error">{error}</p>}
      {success && <p className="mt-3 text-sm text-accent">{success}</p>}
    </section>
  )
}
