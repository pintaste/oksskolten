import { Globe } from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import type { ViewMode } from '../../hooks/use-translate'

interface ArticleTranslationBannerProps {
  viewMode: ViewMode
  onSetMode: (mode: ViewMode) => void
}

export function ArticleTranslationBanner({ viewMode, onSetMode }: ArticleTranslationBannerProps) {
  const { t } = useI18n()

  const modes: { key: ViewMode; label: string }[] = [
    { key: 'original', label: t('article.viewModeOriginal') },
    { key: 'immersive', label: t('article.viewModeImmersive') },
    { key: 'translated', label: t('article.viewModeTranslation') },
  ]

  return (
    <div className="flex items-center gap-2 text-sm text-muted mb-6 select-none">
      <Globe className="w-4 h-4 shrink-0" />
      <div className="flex items-center border border-border rounded overflow-hidden">
        {modes.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onSetMode(key)}
            className={[
              'px-2.5 py-0.5 text-xs transition-colors',
              viewMode === key
                ? 'bg-accent text-accent-text font-medium'
                : 'text-muted hover:text-text',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
