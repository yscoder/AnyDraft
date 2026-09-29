import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Bold,
  Code,
  FileCode2,
  Heading,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  ImagePlus,
  Italic,
  Link,
  List,
  ListChecks,
  Minus,
  Quote,
  Table,
  Undo2,
} from 'lucide-react'
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { Compartment, EditorState } from '@codemirror/state'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  undo,
} from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'
import { autocompletion } from '@codemirror/autocomplete'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { TooltipHint } from '@/components/ui/tooltip'
import {
  imageDestination,
  imageReference,
} from '@/core/markdown/imageReference'
import { codeMirrorKey, shortcutLabel } from '@/features/shortcuts/shortcuts'
import type { ScrollSyncChannel } from '@/core/editor/scrollSync'

/* Lucide 图标统一尺寸；H1–H4 菜单项各用对应字号图标 */
const ICON = 16
const HEADING_ICON = {
  1: Heading1,
  2: Heading2,
  3: Heading3,
  4: Heading4,
} as const

interface Props {
  articleHeader: ReactNode
  value: string
  onChange: (v: string) => void
  /** 保存一张图片到当前文档同级目录，返回最终文件名（失败返回 null） */
  onAddImage: (file: File, preserveOriginal?: boolean) => Promise<string | null>
  /** 已导入图片名列表（标准 Markdown 图片路径补全用） */
  imageNames: string[]
  /** 当前文档路径：切换文档时强制同步 doc */
  fileKey: string
  lineOffset: number
  readOnly?: boolean
  onHelp: () => void
  onViewMode: () => void
  /** 滚动同步通道：把编辑器顶部对应的源码位置发布给预览 */
  sync: ScrollSyncChannel
  /** 预览模式：面板收起 */
  collapsed: boolean
  /** 底部通栏控制的目录展开状态 */
  outlineOpen: boolean
  /**
   * 外部跳转请求（文件树点击图片时定位到引用处）。
   * nonce 用来区分「同一行被再次请求」，否则重复点同一张图不会触发 effect。
   */
  jumpRequest: {
    line: number
    nonce: number
    from?: number
    to?: number
    path?: string
  } | null
}

const EditorPane = forwardRef<HTMLElement, Props>(function EditorPane(
  {
    articleHeader,
    value,
    onChange,
    onAddImage,
    imageNames,
    fileKey,
    lineOffset,
    readOnly = false,
    onHelp,
    onViewMode,
    sync,
    collapsed,
    outlineOpen,
    jumpRequest,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const editable = useMemo(() => new Compartment(), [])
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly
  const fileKeyRef = useRef(fileKey)
  fileKeyRef.current = fileKey
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onHelpRef = useRef(onHelp)
  onHelpRef.current = onHelp
  const onViewModeRef = useRef(onViewMode)
  onViewModeRef.current = onViewMode
  const syncRef = useRef(sync)
  syncRef.current = sync
  const lineOffsetRef = useRef(lineOffset)
  lineOffsetRef.current = lineOffset
  // 补全候选走 ref：CodeMirror 扩展只在挂载时建一次，直接闭包会永远停在挂载时的空列表
  const imageNamesRef = useRef(imageNames)
  imageNamesRef.current = imageNames
  /** 编辑器最近一次上报给父组件的文本（用来区分「自己改的」和「外部改的」） */
  const lastEmittedRef = useRef(value)
  /** onAddImage 走 ref：CodeMirror 监听只在挂载时注册，闭包会停在首个文档 */
  const onAddImageRef = useRef(onAddImage)
  onAddImageRef.current = onAddImage
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imageInsertPositionRef = useRef(0)
  /** 逐张保存图片，成功后在光标处插入标准 Markdown 引用 */
  const insertImages = async (
    files: File[],
    position?: number,
    preserveOriginal = false,
  ) => {
    if (readOnlyRef.current) return
    const view = viewRef.current
    if (!view) return
    const targetFileKey = fileKeyRef.current
    const names: string[] = []
    for (const file of files) {
      if (fileKeyRef.current !== targetFileKey) return
      try {
        const name = await onAddImageRef.current(file, preserveOriginal)
        if (name) names.push(name)
      } catch {
        // 单张失败不阻断其它图片
      }
    }
    if (!names.length || fileKeyRef.current !== targetFileKey) return
    const block = names.map((name) => `${imageReference(name)}\n`).join('')
    const insertAt = Math.min(
      position ?? view.state.selection.main.head,
      view.state.doc.length,
    )
    view.dispatch({
      changes: { from: insertAt, insert: block },
      selection: {
        anchor: insertAt + block.length,
      },
    })
    if (position !== undefined) view.focus()
  }

  // 初始化 CodeMirror 编辑器
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          editable.of([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly),
          ]),
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          history(),
          keymap.of([
            {
              key: codeMirrorKey('help'),
              run: () => {
                onHelpRef.current()
                return true
              },
            },
            {
              key: codeMirrorKey('viewMode'),
              run: () => {
                onViewModeRef.current()
                return true
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab,
            // ⌘B 加粗 / ⌘I 斜体：选中包裹，未选中插入成对标记光标居中
            {
              key: codeMirrorKey('bold'),
              run: () => {
                if (readOnlyRef.current) return false
                wrapSelection('**', '**')
                return true
              },
            },
            {
              key: codeMirrorKey('italic'),
              run: () => {
                if (readOnlyRef.current) return false
                wrapSelection('*', '*')
                return true
              },
            },
          ]),
          EditorView.lineWrapping,
          markdown({
            base: markdownLanguage,
            codeLanguages: languages,
          }),
          // 标准 Markdown 图片目标自动补全
          autocompletion({
            override: [
              (ctx) => {
                const before = ctx.matchBefore(/!\[[^\]\n]*\]\([^\n)]*$/)
                if (!before) return null
                return {
                  from: before.from + before.text.lastIndexOf('(') + 1,
                  options: imageNamesRef.current.map((name) => ({
                    label: name,
                    type: 'image',
                    apply: `${imageDestination(name)})`,
                  })),
                }
              },
            ],
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '13.5px' },
            '.cm-scroller': {
              fontFamily: 'var(--font-sans)',
              lineHeight: '1.75',
              overflow: 'auto',
            },
            '.cm-content': {
              padding: '16px 0',
              caretColor: 'var(--foreground)',
            },
            '.cm-line': { padding: '0 16px' },
            '.cm-gutters': {
              background: 'transparent',
              color: '#b0ab9f',
              fontSize: '12px',
              borderRight: 'none',
            },
            '.cm-gutterElement': { fontFamily: 'var(--font-mono)' },
            '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
              background:
                'color-mix(in oklch, var(--foreground) 14%, transparent)',
            },
            '&.cm-focused': { outline: 'none' },
            '.cm-activeLine': { background: 'var(--muted)' },
            '.cm-activeLineGutter': { background: 'var(--muted)' },
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            const next = update.state.doc.toString()
            lastEmittedRef.current = next
            onChangeRef.current(next)
          }),
        ],
      }),
    })
    viewRef.current = view

    // 编辑滚动 → 预览同步：上报「行号 + 行内比例」这样一个连续量。
    // 只报整数行号会让预览等一整行翻过去才跳一次，观感就是一顿一顿的。
    const scroller = view.scrollDOM
    /** 某个 scrollTop 对应的源码位置（行号 + 行内比例） */
    const positionAt = (scrollTop: number) => {
      // lineBlockAtHeight 用的是「文档高度」坐标系，需先扣掉内容区上边距
      const docTop = Math.max(0, scrollTop - view.documentPadding.top)
      const block = view.lineBlockAtHeight(docTop)
      const line = view.state.doc.lineAt(block.from).number - 1
      const frac =
        block.height > 0
          ? Math.min(1, Math.max(0, (docTop - block.top) / block.height))
          : 0
      return line + frac
    }
    const onScroll = () => {
      const max = scroller.scrollHeight - scroller.clientHeight
      const atBottom = max > 0 && scroller.scrollTop >= max - 2
      const atTop = scroller.scrollTop <= 2
      const position = positionAt(scroller.scrollTop)
      // 顺带上报「滚到底时的位置」，预览用它把文末当虚拟锚点
      syncRef.current.publish({
        position: position + lineOffsetRef.current,
        endPosition:
          (max > 0 ? positionAt(max) : position) + lineOffsetRef.current,
        atTop,
        atBottom,
      })
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    return () => {
      scroller.removeEventListener('scroll', onScroll)
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: editable.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    })
  }, [editable, readOnly])

  // 内容同步：文档切换（fileKey 变化）或外部 value 变化（导入/刷新）时，
  // 若 doc 与 value 不同则全量替换并尽量保持光标。
  // 编辑/撤销产生的变化经 updateListener 已即时写回 value（cur === value），
  // 不会触发这里的同步，因此不影响输入与撤销。
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    // 自己敲出来的改动已经在 updateListener 里上报过，直接跳过 ——
    // 否则每次按键都要把整篇文档 toString 出来比一遍
    if (lastEmittedRef.current === value) return
    const cur = view.state.doc.toString()
    if (cur === value) {
      lastEmittedRef.current = value
      return
    }
    const { anchor, head } = view.state.selection.main
    lastEmittedRef.current = value
    view.dispatch({
      changes: { from: 0, to: cur.length, insert: value },
      selection: {
        anchor: Math.min(anchor, value.length),
        head: Math.min(head, value.length),
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey, value])

  // 外部跳转：定位到指定行并居中。
  // 声明顺序在内容同步之后 —— 跨草稿跳转时新文档已经就位，行号才对得上。
  useEffect(() => {
    if (!jumpRequest || (jumpRequest.path && jumpRequest.path !== fileKey))
      return
    const view = viewRef.current
    if (!view) return
    const lineNo = Math.min(
      Math.max(1, jumpRequest.line + 1),
      view.state.doc.lines,
    )
    const pos = Math.min(
      jumpRequest.from ?? view.state.doc.line(lineNo).from,
      view.state.doc.length,
    )
    view.dispatch({
      selection: {
        anchor: pos,
        head: Math.min(jumpRequest.to ?? pos, view.state.doc.length),
      },
      effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    })
    view.focus()
  }, [jumpRequest])

  // 粘贴图片（截图后直接 ⌘V）
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const dom = view.dom
    const onPaste = (e: ClipboardEvent) => {
      if (readOnlyRef.current) return
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((it) => it.type.startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter((f): f is File => !!f)
      if (!files.length) return
      e.preventDefault()
      void insertImages(files)
    }
    const onDrop = (e: DragEvent) => {
      if (readOnlyRef.current) return
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
        f.type.startsWith('image/'),
      )
      if (!files.length) return
      e.preventDefault()
      void insertImages(files)
    }
    const onDragover = (e: DragEvent) => e.preventDefault()
    dom.addEventListener('paste', onPaste)
    dom.addEventListener('drop', onDrop)
    dom.addEventListener('dragover', onDragover)
    return () => {
      dom.removeEventListener('paste', onPaste)
      dom.removeEventListener('drop', onDrop)
      dom.removeEventListener('dragover', onDragover)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------------- Markdown 格式工具栏 ---------------- */

  /** 取编辑器 view，未挂载时返回 null */
  const withView = <T,>(fn: (view: EditorView) => T): T | null => {
    const view = viewRef.current
    return view ? fn(view) : null
  }
  const withEditableView = <T,>(fn: (view: EditorView) => T): T | null =>
    readOnlyRef.current ? null : withView(fn)

  /** 包裹选区（加粗/斜体/行内码）；无选区时插入成对标记并置光标于中间 */
  const wrapSelection = (before: string, after: string) =>
    withEditableView((view) => {
      const { from, to } = view.state.selection.main
      const text = view.state.doc.sliceString(from, to)
      const sel = text
        ? { anchor: from + before.length, head: to + before.length }
        : { anchor: from + before.length }
      view.dispatch({
        changes: [{ from, to, insert: before + text + after }],
        selection: sel,
      })
      view.focus()
    })

  /** 行首加前缀（标题/引用/列表/待办）；光标所在行整行加 */
  const prefixLine = (prefix: string) =>
    withEditableView((view) => {
      const line = view.state.doc.lineAt(view.state.selection.main.head)
      view.dispatch({
        changes: { from: line.from, insert: prefix },
        selection: { anchor: line.from + prefix.length },
      })
      view.focus()
    })

  /** 光标处插入块（代码围栏/分割线/表格） */
  const insertBlock = (text: string) =>
    withEditableView((view) => {
      const head = view.state.selection.main.head
      view.dispatch({
        changes: { from: head, insert: text },
        selection: { anchor: head + text.length },
      })
      view.focus()
    })

  /** 撤销（CodeMirror 历史栈） */
  const undoEdit = () =>
    withEditableView((view) => {
      undo(view)
      view.focus()
    })

  /** 插入 3×3 表格模板（光标置于表体首格） */
  const insertTable = () =>
    withEditableView((view) => {
      const head = view.state.selection.main.head
      const table =
        '\n| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |\n'
      const bodyStart = head + table.indexOf('|  |')
      view.dispatch({
        changes: { from: head, insert: table },
        selection: { anchor: bodyStart + 2 },
      })
      view.focus()
    })

  /** 标题层级菜单开关 */
  const [headingOpen, setHeadingOpen] = useState(false)
  const headingWrapRef = useRef<HTMLDivElement>(null)
  // 点击菜单外关闭
  useEffect(() => {
    if (!headingOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (!headingWrapRef.current?.contains(e.target as Node))
        setHeadingOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHeadingOpen(false)
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [headingOpen])

  /** 从 markdown 提取标题大纲（行号 → 标题）；抽屉关闭时不扫描全文 */
  const outline = useMemo(() => {
    if (!outlineOpen) return []
    const items: { level: number; text: string; line: number }[] = []
    value.split('\n').forEach((line, i) => {
      const m = line.match(/^(#{1,4})\s+(.+)$/)
      if (m) items.push({ level: m[1].length, text: m[2].trim(), line: i })
    })
    return items
  }, [value, outlineOpen])

  /** 点击大纲项：跳转编辑器对应行 */
  const jumpToLine = (line: number) =>
    withView((view) => {
      view.dispatch({
        selection: { anchor: view.state.doc.line(line + 1).from },
        scrollIntoView: true,
        effects: EditorView.scrollIntoView(view.state.doc.line(line + 1).from, {
          y: 'center',
        }),
      })
      view.focus()
    })

  const headingLevels = [
    { level: 1, label: 'H1 · 一级标题', prefix: '# ' },
    { level: 2, label: 'H2 · 二级标题', prefix: '## ' },
    { level: 3, label: 'H3 · 三级标题', prefix: '### ' },
    { level: 4, label: 'H4 · 四级标题', prefix: '#### ' },
  ]

  const toolbarBtns: {
    key: string
    title: string
    icon: React.ReactNode
    onClick: () => void
  }[] = [
    {
      key: 'bold',
      title: '加粗',
      icon: <Bold size={ICON} />,
      onClick: () => wrapSelection('**', '**'),
    },
    {
      key: 'italic',
      title: '斜体',
      icon: <Italic size={ICON} />,
      onClick: () => wrapSelection('*', '*'),
    },
    {
      key: 'code',
      title: '行内代码',
      icon: <Code size={ICON} />,
      onClick: () => wrapSelection('`', '`'),
    },
    {
      key: 'quote',
      title: '引用',
      icon: <Quote size={ICON} />,
      onClick: () => prefixLine('> '),
    },
    {
      key: 'list',
      title: '无序列表',
      icon: <List size={ICON} />,
      onClick: () => prefixLine('- '),
    },
    {
      key: 'task',
      title: '待办事项',
      icon: <ListChecks size={ICON} />,
      onClick: () => prefixLine('- [ ] '),
    },
    {
      key: 'image',
      title: '图片',
      icon: <ImagePlus size={ICON} />,
      onClick: () => {
        const view = viewRef.current
        if (!view || readOnlyRef.current) return
        imageInsertPositionRef.current = view.state.selection.main.head
        imageInputRef.current?.click()
      },
    },
    {
      key: 'fence',
      title: '代码块',
      icon: <FileCode2 size={ICON} />,
      onClick: () => insertBlock('\n```ts\n\n```\n'),
    },
    {
      key: 'table',
      title: '表格',
      icon: <Table size={ICON} />,
      onClick: insertTable,
    },
    {
      key: 'link',
      title: '链接',
      icon: <Link size={ICON} />,
      onClick: () => wrapSelection('[', '](https://)'),
    },
    {
      key: 'hr',
      title: '分割线',
      icon: <Minus size={ICON} />,
      onClick: () => insertBlock('\n---\n'),
    },
    {
      key: 'undo',
      title: '撤销',
      icon: <Undo2 size={ICON} />,
      onClick: undoEdit,
    },
  ]

  return (
    <section
      ref={ref}
      className={`split-pane editor-side ${collapsed ? 'collapsed' : ''}`}
      aria-hidden={collapsed}
      inert={collapsed}
    >
      <input
        ref={imageInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,.avif"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file)
            void insertImages([file], imageInsertPositionRef.current, true)
        }}
      />
      {/* Markdown 格式工具栏 */}
      {!readOnly && (
        <div
          className="md-toolbar overflow-x-auto"
          role="toolbar"
          aria-label="Markdown 格式"
        >
          {/* 标题层级下拉 */}
          <div className="md-toolbar-dropdown" ref={headingWrapRef}>
            <TooltipHint content="标题（H1–H4）">
              <button
                className="md-toolbar-btn"
                aria-label="标题"
                aria-expanded={headingOpen}
                aria-haspopup="menu"
                onClick={(e) => {
                  e.stopPropagation()
                  setHeadingOpen((v) => !v)
                }}
              >
                <Heading size={ICON} />
              </button>
            </TooltipHint>
            {headingOpen && (
              <div className="md-toolbar-menu" role="menu">
                {headingLevels.map((h) => {
                  const HeadingIcon =
                    HEADING_ICON[h.level as keyof typeof HEADING_ICON]
                  return (
                    <button
                      key={h.level}
                      role="menuitem"
                      onClick={() => {
                        setHeadingOpen(false)
                        prefixLine(h.prefix)
                      }}
                    >
                      <HeadingIcon size={17} className="menu-heading" />
                      {h.label.split('·')[1]?.trim()}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {toolbarBtns
            .map((b) => (
              <TooltipHint
                key={b.key}
                content={`${b.title}${b.key === 'bold' || b.key === 'italic' ? ` ${shortcutLabel(b.key)}` : ''}`}
              >
                <button
                  className="md-toolbar-btn"
                  aria-label={b.title}
                  onClick={b.onClick}
                >
                  {b.icon}
                </button>
              </TooltipHint>
            ))
            .reduce<React.ReactNode[]>((acc, btn, i) => {
              // 逻辑分组：加粗|斜体|行内码 ｜ 引用|列表|待办 ｜ 图片|代码块|表格|链接|分割线 | 撤销
              const groupEnd = [2, 5, 10]
              acc.push(btn)
              if (groupEnd.includes(i))
                acc.push(
                  <span key={`d${i}`} className="md-toolbar-divider"></span>,
                )
              return acc
            }, [])}
        </div>
      )}
      {articleHeader}
      <div className="code-edit" ref={hostRef}></div>
      {outlineOpen && (
        <div className="outline-drawer">
          {outline.length === 0 ? (
            <p className="outline-empty">暂无标题，用 `# ` 开始编写大纲</p>
          ) : (
            outline.map((item, idx) => (
              <button
                key={idx}
                className={`outline-item lv${item.level}`}
                style={{
                  paddingLeft: `${8 + (item.level - 1) * 14}px`,
                }}
                onClick={() => jumpToLine(item.line)}
              >
                {item.level > 1 ? '•' : ''} {item.text}
              </button>
            ))
          )}
        </div>
      )}
    </section>
  )
})

export default EditorPane
