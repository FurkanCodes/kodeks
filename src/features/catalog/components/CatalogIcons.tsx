import { convertFileSrc } from '@tauri-apps/api/core'
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Bot,
  CalendarDays,
  Cloud,
  Code2,
  FileText,
  FolderKanban,
  GitBranch,
  Globe2,
  Mail,
  MessageSquareText,
  Network,
  PencilLine,
  PencilRuler,
  PlugZap,
  Presentation,
  Shapes,
  Sparkles,
  Smartphone,
  SquareDashedBottomCode,
  TabletSmartphone,
  Triangle,
  Workflow,
  Wrench,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

const ICONS: Record<string, LucideIcon> = {
  adapt: TabletSmartphone,
  'agent-browser': Globe2,
  animate: Sparkles,
  'android-compose': Smartphone,
  'android-design': Smartphone,
  'android-kotlin': Code2,
  calendar: CalendarDays,
  cloudflare: Cloud,
  doc: FileText,
  drive: Triangle,
  figma: Shapes,
  'frontend-design': SquareDashedBottomCode,
  'game-studio': Workflow,
  github: GitBranch,
  gmail: Mail,
  'hugging-face': Bot,
  'interface-design': Wrench,
  linear: FolderKanban,
  notion: BookOpen,
  'openai-docs': BookOpen,
  'plugin-creator': PencilRuler,
  sentry: PlugZap,
  skill: Sparkles,
  'skill-creator': PencilLine,
  'skill-installer': Presentation,
  slack: MessageSquareText,
  sora: Sparkles,
  spreadsheet: Presentation,
  vercel: Triangle,
  netlify: Network,
}

const BRAND_IMAGE_SOURCES: Record<string, string> = {
  box: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/box.svg',
  calendar: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/googlecalendar.svg',
  canva: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/canva.svg',
  cloudflare: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/cloudflare.svg',
  drive: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/googledrive.svg',
  figma: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/figma.svg',
  github: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/github.svg',
  gmail: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/gmail.svg',
  'google-calendar': 'https://cdn.jsdelivr.net/npm/simple-icons/icons/googlecalendar.svg',
  'google-drive': 'https://cdn.jsdelivr.net/npm/simple-icons/icons/googledrive.svg',
  'hugging-face': 'https://cdn.jsdelivr.net/npm/simple-icons/icons/huggingface.svg',
  linear: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/linear.svg',
  netlify: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/netlify.svg',
  notion: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/notion.svg',
  'openai-docs': 'https://cdn.jsdelivr.net/npm/simple-icons/icons/openai.svg',
  sentry: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/sentry.svg',
  slack: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/slack.svg',
  sora: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/openai.svg',
  vercel: 'https://cdn.jsdelivr.net/npm/simple-icons/icons/vercel.svg',
}

export function CatalogBrandIcon(props: {
  iconKey?: string | null
  label: string
  brandColor?: string | null
  className?: string
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const imageSrc = useMemo(
    () => (imageFailed ? null : resolveCatalogImageSource(props.iconKey)),
    [imageFailed, props.iconKey],
  )
  const Icon = (!imageSrc && props.iconKey && ICONS[props.iconKey]) || PlugZap
  const accent = props.brandColor || '#d4d4d4'
  const background = hexWithAlpha(accent, '16')
  const imageBackground = 'rgba(248, 243, 235, 0.98)'

  useEffect(() => {
    setImageFailed(false)
  }, [props.iconKey])

  return (
    <div
      className={`flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[13px] ${props.className ?? ''}`}
      style={{
        backgroundColor: imageSrc ? imageBackground : background,
      }}
      aria-hidden="true"
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          className="h-full w-full object-contain p-2"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Icon className="h-5 w-5" style={{ color: accent }} />
      )}
    </div>
  )
}

function resolveCatalogImageSource(value?: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }

  const knownBrandSource = BRAND_IMAGE_SOURCES[trimmed]
  if (knownBrandSource) {
    return knownBrandSource
  }

  if (trimmed in ICONS) {
    return null
  }

  if (/^(https?:\/\/|data:image\/|blob:|asset:)/i.test(trimmed)) {
    return trimmed
  }

  if (trimmed.startsWith('/')) {
    return convertFileSrc(trimmed)
  }

  if (/^\.{1,2}\//.test(trimmed) || /\/.+\.[a-z0-9]+($|\?)/i.test(trimmed) || /\.[a-z0-9]+($|\?)/i.test(trimmed)) {
    return trimmed
  }

  return null
}

function hexWithAlpha(value: string, alpha: string) {
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return `${value}${alpha}`
  }
  return value
}
