import { CatalogWorkspace } from './CatalogWorkspace'
import type { CatalogTab } from './models'

type CatalogModalProps = {
  open: boolean
  initialTab: CatalogTab
  projectRoot: string
  onClose: () => void
  onOpenLocalPath: (path: string) => Promise<void>
  onOpenExternalUrl: (url: string) => Promise<void>
}

export function CatalogModal(props: CatalogModalProps) {
  if (!props.open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm">
      <div className="h-full w-full">
        <CatalogWorkspace
          activeTab={props.initialTab}
          projectRoot={props.projectRoot}
          onOpenLocalPath={props.onOpenLocalPath}
          onOpenExternalUrl={props.onOpenExternalUrl}
        />
      </div>
    </div>
  )
}
