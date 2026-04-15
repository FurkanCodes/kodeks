import type { CSSProperties, ComponentType } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Archive,
  BookOpen,
  Box,
  ChevronRight,
  Clock3,
  CircleGauge,
  CloudOff,
  Columns2,
  Copy,
  CreditCard,
  FolderOpen,
  FolderSearch2,
  Database,
  ExternalLink,
  FileCode2,
  FileText,
  FolderGit2,
  FolderPlus,
  Globe,
  Crosshair,
  Eraser,
  GitBranch,
  GitPullRequest,
  Keyboard,
  Pin,
  LogOut,
  Monitor,
  Minus,
  MoreHorizontal,
  Palette,
  Paperclip,
  Play,
  Plus,
  Puzzle,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  SquarePen,
  RefreshCw,
  Wrench,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Terminal,
  Trash2,
  Undo2,
  User,
  X,
  Zap,
} from 'lucide-react'

type IconProps = {
  className?: string
  size?: number
  style?: CSSProperties
  strokeWidth?: number
}

function renderIcon(
  Icon: ComponentType<{ className?: string; size?: number; style?: CSSProperties; strokeWidth?: number }>,
  props: IconProps,
  strokeWidth = 1.5,
) {
  return (
    <Icon
      className={props.className}
      size={props.size ?? 16}
      style={props.style}
      strokeWidth={props.strokeWidth ?? strokeWidth}
    />
  )
}

export function PlusIcon(props: IconProps) {
  return renderIcon(Plus, props)
}

export function PuzzleIcon(props: IconProps) {
  return renderIcon(Puzzle, props, 1.4)
}

export function BoltIcon(props: IconProps) {
  return renderIcon(Zap, props)
}

export function ChevronIcon(
  props: IconProps & { direction?: 'right' | 'down' },
) {
  const rotation = props.direction === 'down' ? 'rotate-90' : ''
  return renderIcon(
    ChevronRight,
    { ...props, className: `${props.className ?? ''} ${rotation}`.trim() },
  )
}

export function SettingsIcon(props: IconProps) {
  return renderIcon(Settings, props, 1.35)
}

export function KeyboardIcon(props: IconProps) {
  return renderIcon(Keyboard, props, 1.35)
}

export function BookIcon(props: IconProps) {
  return renderIcon(BookOpen, props, 1.35)
}

export function NoteIcon(props: IconProps) {
  return renderIcon(FileText, props, 1.35)
}

export function LogoutIcon(props: IconProps) {
  return renderIcon(LogOut, props, 1.35)
}

export function SearchIcon(props: IconProps) {
  return renderIcon(Search, props, 1.4)
}

export function PaperclipIcon(props: IconProps) {
  return renderIcon(Paperclip, props, 1.35)
}

export function ArrowUpIcon(props: IconProps) {
  return renderIcon(ArrowUp, props)
}

export function ArrowLeftIcon(props: IconProps) {
  return renderIcon(ArrowLeft, props, 1.45)
}

export function ArrowRightIcon(props: IconProps) {
  return renderIcon(ArrowRight, props, 1.45)
}

export function SparkleIcon(props: IconProps) {
  return renderIcon(Sparkles, props, 1.35)
}

export function BranchIcon(props: IconProps) {
  return renderIcon(GitBranch, props, 1.35)
}

export function PullRequestIcon(props: IconProps) {
  return renderIcon(GitPullRequest, props, 1.35)
}

export function PlayIcon(props: IconProps) {
  return renderIcon(Play, props, 1.5)
}

export function MoreIcon(props: IconProps) {
  return renderIcon(MoreHorizontal, props)
}

export function FileCodeIcon(props: IconProps) {
  return renderIcon(FileCode2, props, 1.25)
}

export function CloseIcon(props: IconProps) {
  return renderIcon(X, props)
}

export function DiffRemoveIcon(props: IconProps) {
  return renderIcon(Minus, props)
}

export function DiffAddIcon(props: IconProps) {
  return renderIcon(Plus, props)
}

export function PaletteIcon(props: IconProps) {
  return renderIcon(Palette, props, 1.25)
}

export function CubeIcon(props: IconProps) {
  return renderIcon(Box, props, 1.25)
}

export function TerminalIcon(props: IconProps) {
  return renderIcon(Terminal, props, 1.25)
}

export function FolderOpenIcon(props: IconProps) {
  return renderIcon(FolderOpen, props, 1.25)
}

export function FolderGitIcon(props: IconProps) {
  return renderIcon(FolderGit2, props, 1.25)
}

export function FolderPlusIcon(props: IconProps) {
  return renderIcon(FolderPlus, props, 1.25)
}

export function MonitorIcon(props: IconProps) {
  return renderIcon(Monitor, props, 1.25)
}

export function GlobeIcon(props: IconProps) {
  return renderIcon(Globe, props, 1.25)
}

export function FolderSearchIcon(props: IconProps) {
  return renderIcon(FolderSearch2, props, 1.25)
}

export function ArchiveIcon(props: IconProps) {
  return renderIcon(Archive, props, 1.25)
}

export function TrashIcon(props: IconProps) {
  return renderIcon(Trash2, props, 1.25)
}

export function UndoIcon(props: IconProps) {
  return renderIcon(Undo2, props, 1.25)
}

export function DatabaseIcon(props: IconProps) {
  return renderIcon(Database, props, 1.25)
}

export function UserIcon(props: IconProps) {
  return renderIcon(User, props, 1.3)
}

export function CreditCardIcon(props: IconProps) {
  return renderIcon(CreditCard, props, 1.25)
}

export function CopyIcon(props: IconProps) {
  return renderIcon(Copy, props, 1.25)
}

export function ExternalLinkIcon(props: IconProps) {
  return renderIcon(ExternalLink, props, 1.25)
}

export function CloudOffIcon(props: IconProps) {
  return renderIcon(CloudOff, props, 1.25)
}

export function GaugeIcon(props: IconProps) {
  return renderIcon(CircleGauge, props, 1.25)
}

export function ClockIcon(props: IconProps) {
  return renderIcon(Clock3, props, 1.25)
}

export function ShieldIcon(props: IconProps) {
  return renderIcon(Shield, props, 1.25)
}

export function ShieldAlertIcon(props: IconProps) {
  return renderIcon(ShieldAlert, props, 1.25)
}

export function RefreshIcon(props: IconProps) {
  return renderIcon(RefreshCw, props, 1.25)
}

export function WrenchIcon(props: IconProps) {
  return renderIcon(Wrench, props, 1.25)
}

export function CrosshairIcon(props: IconProps) {
  return renderIcon(Crosshair, props, 1.25)
}

export function EraserIcon(props: IconProps) {
  return renderIcon(Eraser, props, 1.25)
}

export function SidebarCollapseIcon(props: IconProps) {
  return renderIcon(PanelLeftClose, props, 1.35)
}

export function SidebarExpandIcon(props: IconProps) {
  return renderIcon(PanelLeftOpen, props, 1.35)
}

export function PinIcon(props: IconProps) {
  return renderIcon(Pin, props, 1.3)
}

export function SquarePenIcon(props: IconProps) {
  return renderIcon(SquarePen, props, 1.25)
}

export function SplitViewIcon(props: IconProps) {
  return renderIcon(Columns2, props, 1.25)
}
