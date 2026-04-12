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

export function CatalogBrandIcon(props: {
  iconKey?: string | null
  label: string
  brandColor?: string | null
  className?: string
}) {
  const Icon = (props.iconKey && ICONS[props.iconKey]) || PlugZap
  const accent = props.brandColor || '#d4d4d4'
  const background = hexWithAlpha(accent, '16')
  const border = hexWithAlpha(accent, '28')

  return (
    <div
      className={`flex size-11 shrink-0 items-center justify-center rounded-[13px] border ${props.className ?? ''}`}
      style={{
        backgroundColor: background,
        borderColor: border,
      }}
      aria-hidden="true"
    >
      <Icon className="h-5 w-5" style={{ color: accent }} />
    </div>
  )
}

function hexWithAlpha(value: string, alpha: string) {
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return `${value}${alpha}`
  }
  return value
}
