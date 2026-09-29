/** 文件名编码为标准 Markdown 图片目标，括号必须编码以免提前结束链接。 */
export function imageDestination(name: string): string {
  return encodeURIComponent(name).replace(/[()]/g, (char) =>
    char === '(' ? '%28' : '%29',
  )
}

/** 新插入图片统一使用标准 Markdown 语法。 */
export function imageReference(name: string): string {
  const alt = name.replace(/[\\[\]*_`]/g, '\\$&')
  return `![${alt}](${imageDestination(name)})`
}
