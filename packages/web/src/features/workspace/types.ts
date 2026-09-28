export interface Confirmation {
  title: string
  description: string
  actionLabel: string
  onConfirm: () => void | Promise<void>
}

export type RepoStatus =
  | 'checking'
  | 'unsupported'
  | 'need-pick'
  | 'need-permission'
  | 'ready'
  | 'error'
