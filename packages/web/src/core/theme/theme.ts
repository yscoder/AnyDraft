/**
 * 主题系统 —— 预览与导出的唯一样式来源。
 * 所有样式必须内联（微信编辑器会丢弃 class 与 <style>，只保留内联 style），
 * 因此这里不产出任何 CSS 类，只产出 style 字符串。
 *
 * 每套主题是一个完整的样式令牌集，渲染器按主题参数化输出内联样式。
 */
import type { Theme } from './types'
import { classicTheme } from './themes/classic'
import { editorialTheme } from './themes/editorial'
import { indigoTheme } from './themes/indigo'
import { inkTheme } from './themes/ink'
import { sakuraTheme } from './themes/sakura'
import { minimalTheme } from './themes/minimal'

import { githubTheme } from './themes/github'
import { smartblueTheme } from './themes/smartblue'
import { cyanosisTheme } from './themes/cyanosis'
import { channingCyanTheme } from './themes/channing-cyan'
import { fancyTheme } from './themes/fancy'
import { hydrogenTheme } from './themes/hydrogen'
import { greenwillowTheme } from './themes/greenwillow'
import { vGreenTheme } from './themes/v-green'
import { healerReadableTheme } from './themes/healer-readable'
import { jzmanTheme } from './themes/jzman'
import { geekBlackTheme } from './themes/geek-black'
import { orangeTheme } from './themes/orange'
import { scrollsLightTheme } from './themes/scrolls-light'
import { arknightsTheme } from './themes/arknights'
import { vuepressTheme } from './themes/vuepress'
import { ChineseRedTheme } from './themes/Chinese-red'
import { devuiBlueTheme } from './themes/devui-blue'
import { sereneRoseTheme } from './themes/serene-rose'
import { zBlueTheme } from './themes/z-blue'
import { lilsnakeTheme } from './themes/lilsnake'

export type { Theme } from './types'

export const themes: Theme[] = [
  classicTheme,
  minimalTheme,
  editorialTheme,
  inkTheme,
  sakuraTheme,
  indigoTheme,
  githubTheme,
  smartblueTheme,
  cyanosisTheme,
  channingCyanTheme,
  fancyTheme,
  hydrogenTheme,
  greenwillowTheme,
  vGreenTheme,
  healerReadableTheme,
  jzmanTheme,
  geekBlackTheme,
  orangeTheme,
  scrollsLightTheme,
  arknightsTheme,
  vuepressTheme,
  ChineseRedTheme,
  devuiBlueTheme,
  sereneRoseTheme,
  zBlueTheme,
  lilsnakeTheme,
]

/** 按 id 取主题，找不到回退经典 */
export function getTheme(id?: string): Theme {
  return themes.find((t) => t.id === id) ?? classicTheme
}

/* ---------------- 密度缩放（字号/行高/间距） ---------------- */

export interface DensityScale {
  /** 字号倍率 */
  font: number
  /** 行高倍率（body 与标题） */
  line: number
  /** 垂直间距倍率（段距 / 标题边距 / 引用边距等） */
  margin: number
}

/** 把字符串里所有 px 数值乘以 k（0 值不受影响） */
const px = (v: string, k: number) =>
  v.replace(
    /-?\d+(\.\d+)?(?=px)/g,
    (m) => `${(parseFloat(m) * k).toFixed(2).replace(/\.?0+$/, '')}`,
  )

/** 按密度倍率生成一份缩放后的主题（不修改原对象） */
export function applyDensity(th: Theme, d: DensityScale): Theme {
  const f = d.font
  const m = f * d.margin
  return {
    ...th,
    body: {
      ...th.body,
      fontSize: px(th.body.fontSize, f),
      lineHeight: `${parseFloat(th.body.lineHeight) * d.line}`,
    },
    pMargin: px(th.pMargin, m),
    heading: {
      ...th.heading,
      lineHeight: `${parseFloat(th.heading.lineHeight) * d.line}`,
      marginTop: px(th.heading.marginTop, m),
      marginBottom: px(th.heading.marginBottom, m),
    },
    headingSizes: Object.fromEntries(
      Object.entries(th.headingSizes).map(([k, v]) => [k, px(v, f)]),
    ) as Theme['headingSizes'],
    quote: { ...th.quote, margin: px(th.quote.margin, m) },
    callout: { ...th.callout, margin: px(th.callout.margin, m) },
    hr: { ...th.hr, margin: px(th.hr.margin, m) },
    img: { ...th.img, margin: px(th.img.margin, m) },
    footnote: { ...th.footnote, textSize: px(th.footnote.textSize, f) },
    listItemMargin: px(th.listItemMargin, m),
    table: { ...th.table, fontSize: px(th.table.fontSize, f) },
  }
}

/**
 * 排版密度档位。
 * 「标准」是恒等变换 —— 各主题自己调好的字号/行高/间距就是设计基准，
 * 紧凑与宽松只在它两侧偏移，这样切主题不会因为密度默认值而走样。
 */
export const DENSITIES: { id: string; name: string; scale: DensityScale }[] = [
  {
    id: 'compact',
    name: '紧凑',
    scale: { font: 0.92, line: 0.94, margin: 0.78 },
  },
  { id: 'standard', name: '标准', scale: { font: 1, line: 1, margin: 1 } },
  {
    id: 'roomy',
    name: '宽松',
    scale: { font: 1.08, line: 1.06, margin: 1.22 },
  },
]

export function getDensity(id?: string): DensityScale {
  return (DENSITIES.find((d) => d.id === id) ?? DENSITIES[1]).scale
}

/** 把样式对象拼成 style 字符串：{ color:'red' } → 'color:red;' */
export function st(styles: Record<string, string | number>): string {
  // 渲染热点：整篇文章每个元素都会调一次，避免 Object.entries + map + join 的中间数组
  let out = ''
  for (const k in styles) {
    if (out) out += ';'
    out += k
    out += ':'
    out += styles[k]
  }
  return out
}
