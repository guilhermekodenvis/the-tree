import type { TreeApi } from '../../shared/types'

declare global {
  interface Window {
    api: TreeApi
  }
}

export {}
