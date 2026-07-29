import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fetcher, apiPost, apiDelete } from '../../../../lib/fetcher'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { Puzzle, Search, Download, Zap, Pencil, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TFunc, StoredCustomProvider, CustomApiFormat, CustomProviderFormMode, CollapsibleCardWrapper, IconBtn, ProviderConnectionError, mergeModels, getCustomProviderStatusText } from './shared'

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

export { CustomCard, CustomProviderAddForm, CustomProviderCard, CustomProviderDialog, CustomProviderForm }
