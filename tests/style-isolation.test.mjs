/**
 * 预览 / 导出样式隔离测试。
 *
 * 项目承诺「预览与导出同构」：同一份正文 HTML，右侧预览与粘贴到公众号后
 * 应该长得一模一样。这条承诺会被一类静默故障击穿 —— 渲染器漏写某个属性，
 * 预览里由应用的全局样式（Tailwind preflight + 应用自己的 @layer base）兜底，
 * 导出后由公众号的 UA 样式兜底，两边默认值不同，于是样式悄悄走样，且不报错。
 *
 * 内联 style 的优先级高于任何选择器，所以「被覆盖」不会发生；真正要防的是
 * 这种「渲染器没写、靠外部环境兜底」的依赖。本测试把这种依赖测出来：
 * 同一份 HTML 分别放进
 *   - APP ：带应用全局样式的文档（模拟预览）
 *   - BARE：没有任何作者样式的文档（模拟导出到公众号，只有 UA 默认样式）
 * 逐个属性比对 getComputedStyle，任何差异都是一处环境依赖。
 *
 * 运行：npm test
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { before, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const WEB = path.join(ROOT, 'packages/web');

/**
 * 参与比对的属性。
 *
 * 只列会影响排版、且渲染器自己应当写全的属性。刻意不列：
 *   - text-indent / height：渲染器从不设置，差异只是 jsdom 的取值格式不同
 *   - border-*-color ：凡是真的画了边框的元素，都用 border 简写连颜色一起写了，
 *                      裸 border-color 的差异在边框宽度为 0 时不影响渲染
 *   - border-*-width / border-*-style：渲染器用 border 简写设置边框，而 jsdom
 *                      不会把简写展开成长写，取到的永远是空串，列进来只有噪音
 */
const PROPS = [
  'display',
  'position',
  'top',
  'box-sizing',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'color',
  'background-color',
  'text-align',
  'text-decoration-line',
  'vertical-align',
  'white-space',
  'word-break',
  'margin-top',
  'margin-bottom',
  'padding-top',
  'padding-left',
  'border-radius',
  'list-style',
  'list-style-type',
  'list-style-position',
  'max-width',
  'width',
];

/** 只有盒子里有文字时，字体与颜色类属性才可能影响渲染 */
const TEXT_PROPS = new Set([
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'color',
  'text-align',
  'text-decoration-line',
  'white-space',
  'word-break',
]);

const FIXTURE = readFileSync(path.join(HERE, 'fixtures/article.md'), 'utf8');

/**
 * 预检：确认 preflight 里那些真正会影响正文的规则在 jsdom 下确实生效。
 * 如果 Tailwind 升级改了这些规则，或 jsdom 换了解析行为，这里先红，
 * 免得主测试因为「重置根本没生效」而假绿。
 */
const RESET_PROBES = [
  { selector: 'ul', prop: 'list-style', expected: 'none' },
  { selector: 'sup', prop: 'vertical-align', expected: 'baseline' },
  { selector: 'sup', prop: 'position', expected: 'relative' },
  { selector: 'p', prop: 'box-sizing', expected: 'border-box' },
];

/** 应用外壳的全局样式，对应 packages/web/src/styles.css 的 @layer base 与 html/body 规则。
 *  jsdom 解析不了 var() / oklch()，所以这里写成等价的字面值。 */
const APP_SHELL_CSS = `
  * { border-color: #e5e7eb; outline-color: #9ca3af; }
  html { line-height: 1.5; font-family: 'Figtree Variable', sans-serif; }
  body { font-family: 'Figtree Variable', sans-serif; color: #231f1c; }
`;

/**
 * 读 Tailwind 真实的 preflight，而不是手抄一份（手抄的会随升级悄悄漂移）。
 * 只做一件事：去掉选择器列表里的伪元素 —— jsdom 的选择器引擎不认识它们，
 * 一旦列表里混进一个不认识的，整条规则都匹配不上，`* { box-sizing }`
 * 那条通用重置就会被静默丢弃，测试随即假绿。
 */
function normalizeForJsdom(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^([^{]*)\{/gm, (whole, selector) => {
      if (selector.trim().startsWith('@')) return whole;
      const parts = selector
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith('::'));
      return parts.length ? `${parts.join(', ')} {` : whole;
    });
}

function buildDocument(html, css) {
  return new JSDOM(
    `<!doctype html><html><head><style>${css}</style></head><body><div id="article">${html}</div></body></html>`,
  );
}

/**
 * 这个属性在当前元素上是否真的影响渲染。
 * 不比对的存 null，两边都是 null 即相等 —— 用「属性不适用」来消除无意义差异，
 * 而不是靠一份会过期的黑名单。
 */
function applies(prop, { display, position, inline, hasText }) {
  if (TEXT_PROPS.has(prop) && !hasText) return false;
  // vertical-align 对块级盒子无效（块级图片的取值差异因此不算问题）
  if (prop === 'vertical-align') return display !== 'block' && display !== 'flex' && display !== 'grid';
  // 定位元素的偏移量只在非 static 下生效
  if (prop === 'top') return position !== 'static' && position !== '';
  // 盒模型只在元素自己设了宽度时才可能改变盒子大小
  if (prop === 'box-sizing') return /(^|;)\s*width\s*:/.test(inline);
  return true;
}

/** 逐个元素的计算样式快照，两套文档用同一套顺序，按下标配对 */
function snapshot(dom) {
  const doc = dom.window.document;
  return [...doc.querySelectorAll('#article *')].map((el) => {
    const cs = dom.window.getComputedStyle(el);
    const ctx = {
      display: cs.getPropertyValue('display'),
      position: cs.getPropertyValue('position'),
      inline: el.getAttribute('style') ?? '',
      hasText: el.textContent.trim() !== '',
    };
    const rec = { tag: el.tagName.toLowerCase() };
    for (const p of PROPS) rec[p] = applies(p, ctx) ? normalizeValue(cs.getPropertyValue(p)) : null;
    return rec;
  });
}

/** jsdom 对同一个零值会给出 "0px" 与 "0" 两种写法，比之前先归一 */
function normalizeValue(v) {
  return typeof v === 'string' && /^-?(0(?:\.0+)?)(px|em|rem|pt|%)$/.test(v) ? '0' : v;
}

/** 两套快照的差异。同一处差异在几十个元素上重复出现，按 tag+属性 去重后再报 */
function diff(inApp, inBare) {
  assert.equal(inApp.length, inBare.length, '两套文档的元素数量不一致');
  const seen = new Map();
  for (let i = 0; i < inApp.length; i++) {
    const a = inApp[i];
    const b = inBare[i];
    for (const p of PROPS) {
      if (a[p] === b[p]) continue;
      const key = `${a.tag}.${p}`;
      if (!seen.has(key)) seen.set(key, { tag: a.tag, prop: p, inApp: a[p], inBare: b[p] });
    }
  }
  return [...seen.values()];
}

let renderArticle;
let themes;
let getDensity;

before(async () => {
  // 复用项目自己的 Vite 配置来加载 TS 渲染器：@/ 别名、依赖解析都不必在
  // 测试里重新配置一遍，也就不会和真实构建产生偏差
  const server = await createServer({
    configFile: path.join(WEB, 'vite.config.ts'),
    root: WEB,
    logLevel: 'error',
    // 只为加载渲染器，不需要浏览器侧的依赖预构建：关掉扫描，避免 esbuild
    // 去解析 index.html 整棵依赖树（既慢又会在 server.close() 后刷一堆报错）
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
  });
  try {
    const md = await server.ssrLoadModule('/src/core/markdown/markdown.ts');
    const theme = await server.ssrLoadModule('/src/core/theme/theme.ts');
    renderArticle = md.renderArticle;
    themes = theme.themes;
    getDensity = theme.getDensity;
  } finally {
    await server.close();
  }
});

describe('正文样式不依赖应用全局样式', () => {
  it('全局重置在测试环境里确实生效（预检）', () => {
    const css = normalizeForJsdom(readFileSync(path.join(ROOT, 'node_modules/tailwindcss/preflight.css'), 'utf8'));
    const dom = buildDocument('<ul><li>x</li></ul><sup>1</sup><p>x</p>', css);
    for (const { selector, prop, expected } of RESET_PROBES) {
      const actual = dom.window
        .getComputedStyle(dom.window.document.querySelector(selector))
        .getPropertyValue(prop);
      assert.equal(actual, expected, `preflight 的 ${selector} { ${prop} } 未生效，主测试会假绿`);
    }
  });

  it('同一份 HTML 在应用环境里与在干净环境里计算样式完全一致', () => {
    const appCss =
      normalizeForJsdom(readFileSync(path.join(ROOT, 'node_modules/tailwindcss/preflight.css'), 'utf8')) +
      APP_SHELL_CSS;
    const density = getDensity('standard');

    const failures = [];
    for (const theme of themes) {
      const { html } = renderArticle(FIXTURE, theme, {}, density);
      const found = diff(snapshot(buildDocument(html, appCss)), snapshot(buildDocument(html, '')));
      if (found.length) failures.push({ theme: theme.id, found });
    }

    if (failures.length) {
      const lines = ['以下属性在「应用环境」与「导出环境」取值不同，即渲染器把它们交给了外部环境兜底：', ''];
      for (const { theme, found } of failures) {
        lines.push(`  [${theme}]`);
        for (const d of found) {
          lines.push(`    <${d.tag}> ${d.prop}: 预览=${JSON.stringify(d.inApp)} 导出=${JSON.stringify(d.inBare)}`);
        }
        lines.push('');
      }
      assert.fail(lines.join('\n'));
    }
  });
});
