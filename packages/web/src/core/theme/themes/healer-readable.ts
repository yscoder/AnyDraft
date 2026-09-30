import { communityTheme } from './community'

/** 来源：https://github.com/healerLZH/juejin-markdown-theme-healer-readable/blob/3f2ef56/healer-readable.scss */
export const healerReadableTheme = communityTheme({
  id: 'healer-readable',
  name: '舒读蓝',
  description: '改编自 healer-readable Markdown 样式',
  accent: '#007fff',
  body: {
    fontSize: '18px',
    lineHeight: '1.75',
    color: '#333',
  },
  heading: {
    fontWeight: '700',
    color: '#007fff',
    lineHeight: '1.5',
    marginTop: '30px',
    marginBottom: '20px',
    decor: 'underline',
  },
  headingSizes: {
    h1: '30px',
    h2: '24px',
    h3: '20px',
    h4: '18px',
    h5: '16px',
    h6: '14px',
  },
  pMargin: '22px',
  quote: {
    background: '#eef7ff',
    color: '#666',
    borderLeft: '4px solid #007fff',
    padding: '1px 23px',
    margin: '22px 0',
  },
  code: {
    background: '#e6f3ff',
    color: '#007fff',
    padding: '0.065em 0.4em',
    fontSize: '16px',
  },
  codeBlock: {
    background: '#f8f8f8',
    color: '#333',
    padding: '15px 12px',
    fontSize: '18px',
  },
  link: {
    color: '#007fff',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#a5d3ff',
    headBg: '#c6e3ff',
    headColor: '#000',
    fontSize: '16px',
    cellPadding: '12px 7px',
  },
  strongColor: '#007fff',
})
