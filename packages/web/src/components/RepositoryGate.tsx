import { Brand } from '@/components/Brand'
import { Button } from '@/components/ui/button'
import type { AppRuntime } from '@any-draft/shared'
import type { RefObject } from 'react'
import type { RepoStatus } from '@/features/workspace/types'

interface Props {
  repoStatus: RepoStatus
  repoError: string
  pendingName: string
  runtimeRef: RefObject<AppRuntime | null>
  onGrantPermission: () => void
  onChangeRoot: () => void
  onPickRoot: () => void
  onUseOpfs: () => void
}

export default function RepositoryGate({
  repoStatus,
  repoError,
  pendingName,
  runtimeRef,
  onGrantPermission,
  onChangeRoot,
  onPickRoot,
  onUseOpfs,
}: Props) {
  if (repoStatus !== 'ready') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-[radial-gradient(1200px_600px_at_20%_-10%,color-mix(in_oklch,var(--accent)_9%,transparent),transparent),var(--background)]">
        <div className="w-[min(420px,100%)] flex flex-col gap-3.5 pt-[30px] px-7 pb-6 bg-[var(--panel-solid,#fffdf9)] border border-border rounded-2xl shadow-[0_24px_60px_-30px_rgba(60,54,44,0.25)]">
          <Brand />

          {repoStatus === 'error' ? (
            <>
              <h1 className="mt-1 text-[17px] font-[650] tracking-[0.2px] text-foreground">
                应用启动失败
              </h1>
              <p className="m-0 text-[13px] leading-[1.7] text-muted-foreground">
                {repoError || '请重新启动应用后再试。'}
              </p>
            </>
          ) : repoStatus === 'unsupported' ? (
            <>
              <h1 className="mt-1 text-[17px] font-[650] tracking-[0.2px] text-foreground">
                当前浏览器暂不支持
              </h1>
              <p className="m-0 text-[13px] leading-[1.7] text-muted-foreground">
                稿域依赖浏览器的 File System Access
                能力读写文件，你的浏览器缺少该能力。 请换用 Chrome / Edge
                后重新打开本页面。
              </p>
            </>
          ) : repoStatus === 'need-permission' ? (
            <>
              <h1 className="mt-1 text-[17px] font-[650] tracking-[0.2px] text-foreground">
                继续使用「{pendingName}」
              </h1>
              <p className="m-0 text-[13px] leading-[1.7] text-muted-foreground">
                浏览器要求在每次会话中重新确认对该目录的写入权限。
              </p>
              <div className="flex flex-col gap-2.5 mt-1.5">
                <Button size="lg" onClick={() => void onGrantPermission()}>
                  授权并继续
                </Button>
                <button
                  className="self-center border-none bg-transparent text-xs text-muted-foreground cursor-pointer underline underline-offset-[3px] hover:text-[var(--accent-strong)]"
                  onClick={onChangeRoot}
                >
                  选择其它目录
                </button>
              </div>
            </>
          ) : repoStatus === 'need-pick' ? (
            <>
              {runtimeRef.current?.canPickRepository() ? (
                <>
                  <h1 className="mt-1 text-[17px] font-[650] tracking-[0.2px] text-foreground">
                    选择你的工作目录
                  </h1>
                  <p className="m-0 text-[13px] leading-[1.7] text-muted-foreground">
                    草稿会以 .md
                    文件、图片会以真实图片文件保存在你指定的文件夹里，
                    与本地文件完全同构，可随时用其它工具打开。
                  </p>
                  <div className="flex flex-col gap-2.5 mt-1.5">
                    <Button size="lg" onClick={() => void onPickRoot()}>
                      打开目录
                    </Button>
                    {runtimeRef.current?.canUseInternalStorage() ? (
                      <button
                        className="self-center border-none bg-transparent text-xs text-muted-foreground cursor-pointer underline underline-offset-[3px] hover:text-[var(--accent-strong)]"
                        onClick={() => void onUseOpfs()}
                      >
                        改用浏览器内置存储
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <h1 className="mt-1 text-[17px] font-[650] tracking-[0.2px] text-foreground">
                    使用浏览器内置存储
                  </h1>
                  <p className="m-0 text-[13px] leading-[1.7] text-muted-foreground">
                    当前浏览器/环境禁用了「选择目录」能力（常见于企业策略或安全扩展）。
                    仍可改用浏览器内置存储继续写作：同样支持 .md
                    文档、文件夹与图片，
                    只是数据存放在浏览器内部，不会出现在你的电脑文件夹里。
                  </p>
                  <div className="flex flex-col gap-2.5 mt-1.5">
                    <Button size="lg" onClick={() => void onUseOpfs()}>
                      使用内置存储
                    </Button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <h1 className="mt-1 text-[17px] font-[650] tracking-[0.2px] text-foreground">
                正在检查工作目录…
              </h1>
            </>
          )}

          <p className="mt-1.5 pt-3 border-t border-dashed border-border text-[11px] leading-[1.7] text-[var(--faint)]">
            文件保存在你的本地，稿域不会上传任何内容。
          </p>
        </div>
      </div>
    )
  }
  return null
}
