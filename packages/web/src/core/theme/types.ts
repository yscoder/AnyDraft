export interface Theme {
  id: string
  name: string
  description: string
  /** 正文基础（section 包裹 / 段落继承） */
  body: {
    font: string
    fontSize: string
    lineHeight: string
    color: string
    /** 文章背景（设置后预览卡与导出均采用） */
    bg?: string
  }
  /** 强调色（标题装饰 / 引用 / 链接等） */
  accent: string
  /** 强调色的淡色（用于色带等大面积背景） */
  accentSoft?: string
  /** 标题 */
  heading: {
    font: string
    fontWeight: string
    color: string
    lineHeight: string
    letterSpacing?: string
    marginTop: string
    marginBottom: string
    textAlign?: string
    /** 标题装饰：accent-bar 顶部强调条 / underline 下划线 / band 背景色 / rule 粗规则线 / symbol 前置 # / left-bar 左侧竖条 / none */
    decor?:
      | 'none'
      | 'underline'
      | 'band'
      | 'accent-bar'
      | 'rule'
      | 'symbol'
      | 'left-bar'
  }
  headingSizes: {
    h1: string
    h2: string
    h3: string
    h4: string
    h5: string
    h6: string
  }
  /** 段落间距 */
  pMargin: string
  /** 提示条（> [!tip]） */
  callout: {
    background: string
    color: string
    borderLeft: string
    borderRadius: string
    padding: string
    margin: string
    /** 标题徽标底色（默认取 accentSoft） */
    badgeBg?: string
    /** 标题徽标文字色（默认取 accent） */
    badgeColor?: string
    extra?: Record<string, string>
  }
  /** 引用块 */
  quote: {
    background: string
    color: string
    borderLeft: string
    borderRadius: string
    padding: string
    margin: string
    fontStyle?: string
    /** 大引号装饰字符 */
    bigMark?: boolean
    extra?: Record<string, string>
  }
  /** 行内代码 */
  code: {
    background: string
    color: string
    borderRadius: string
    padding: string
    fontSize: string
    extra?: Record<string, string>
  }
  /** 块级代码 */
  codeBlock: {
    background: string
    color: string
    borderRadius: string
    padding: string
    fontSize: string
    lineHeight: string
    extra?: Record<string, string>
  }
  /** 链接 */
  link: { color: string; textDecoration: string }
  listPaddingLeft: string
  listItemMargin: string
  /** 表格 */
  table: {
    borderColor: string
    headBg: string
    headColor: string
    fontSize: string
    cellPadding: string
  }
  /** 分割线 */
  hr: { color: string; margin: string }
  /** 图片 */
  img: { borderRadius: string; margin: string }
  /** 加粗颜色（'inherit' 表示继承正文色） */
  strongColor: string
  /** 删除线颜色 */
  delColor: string
  /** ==高亮== 标记 */
  mark: {
    background: string
    color: string
    borderRadius: string
    padding: string
  }
  /** 脚注 */
  footnote: {
    refColor: string
    blockBorder: string
    textColor: string
    numColor: string
    textSize: string
  }
}
