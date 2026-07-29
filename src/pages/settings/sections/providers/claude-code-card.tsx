import useSWR from 'swr'
import { fetcher } from '../../../../lib/fetcher'
import { PROVIDER_LABELS } from '../../../../data/aiModels'
import { ExternalLink, CircleDot, CircleCheck, CircleSlash, EyeOff } from 'lucide-react'
import { TFunc, CollapsibleCardWrapper, IconBtn } from './shared'

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

export { ClaudeCodeCard }
