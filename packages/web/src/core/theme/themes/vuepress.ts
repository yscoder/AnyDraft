import { SANS } from '../fonts'
import { communityTheme } from './community'

/** 来源：https://github.com/promise96319/juejin-markdown-theme-vuepress/blob/af6f62a/vuepress.scss */
export const vuepressTheme = communityTheme({
  id: 'vuepress',
  name: 'VuePress',
  description: '改编自 vuepress Markdown 样式',
  accent: '#3eaf7c',
  body: {
    font: SANS,
    fontSize: '16px',
    lineHeight: '1.7',
    color: '#2c3e50',
  },
  heading: {
    font: SANS,
    fontWeight: '600',
    color: '#2c3e50',
    lineHeight: '1.5',
    marginTop: '35px',
    marginBottom: '5px',
    decor: 'none',
  },
  headingSizes: {
    h1: '30px',
    h2: '24px',
    h3: '18px',
    h4: '16px',
    h5: '15px',
    h6: '14px',
  },
  pMargin: '22px',
  quote: {
    background: '#f3f5f7',
    color: '#2c3e50',
    borderLeft: '6px solid #42b983',
    padding: '6px 23px',
    margin: '22px 0',
  },
  code: {
    background: 'rgba(27,31,35,0.05)',
    color: '#476582',
    padding: '0.165em 0.5em',
    fontSize: '0.87em',
  },
  codeBlock: {
    background: '#282c34',
    color: '#fff',
    padding: '14px 16px',
    fontSize: '14px',
  },
  link: {
    color: '#3eaf7c',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#dfe2e5',
    headBg: '#3eaf7c',
    headColor: '#fff',
    fontSize: '14px',
    cellPadding: '10px 16px',
  },
  strongColor: '#2c3e50',
})
