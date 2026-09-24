import * as Darkmode from 'mp-darkmode'

/** Convert only the preview; restore DOM and remove generated CSS before rerendering. */
export function applyPreviewDarkmode(screen: HTMLElement): () => void {
  const nodes = [screen, ...screen.querySelectorAll<HTMLElement>('*')].filter(
    (node) => node instanceof HTMLElement,
  )
  const originals = nodes.map((node) => {
    const computed = getComputedStyle(node)
    return {
      node,
      style: node.getAttribute('style'),
      className: node.getAttribute('class'),
      properties: new Set(Object.keys(node)),
      // The SDK reads inline declarations; device chrome uses stylesheet tokens.
      colors: [
        'color',
        'background-color',
        'border-top-color',
        'border-right-color',
        'border-bottom-color',
        'border-left-color',
      ].map((property) => [property, computed.getPropertyValue(property)]),
    }
  })
  const existingStyles = new Set(document.head.querySelectorAll('style'))
  const darkClass = 'data_color_scheme_dark'
  const hadDarkClass = document.documentElement.classList.contains(darkClass)
  // mp-darkmode initializes once, so subsequent runs must restore its root marker.
  document.documentElement.classList.add(darkClass)
  for (const { node, colors } of originals) {
    for (const [property, value] of colors)
      node.style.setProperty(property, value)
  }
  Darkmode.run(nodes, {
    mode: 'dark',
    needJudgeFirstPage: false,
    cssSelectorsPrefix: '.preview-side',
  })
  const generatedStyles = [...document.head.querySelectorAll('style')].filter(
    (style) => !existingStyles.has(style),
  )
  const restore = () => {
    for (const style of generatedStyles) style.remove()
    for (const { node, style, className, properties } of originals) {
      if (style === null) node.removeAttribute('style')
      else node.setAttribute('style', style)
      if (className === null) node.removeAttribute('class')
      else node.setAttribute('class', className)
      // The SDK caches original colors as expando properties on each DOM node.
      for (const key of Object.keys(node)) {
        if (key.startsWith('data-darkmode-') && !properties.has(key)) {
          Reflect.deleteProperty(node, key)
        }
      }
    }
    if (!hadDarkClass) document.documentElement.classList.remove(darkClass)
  }
  return restore
}
