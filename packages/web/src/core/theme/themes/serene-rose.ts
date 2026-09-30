import { communityTheme } from './community'

/** 来源：https://github.com/Krue1/juejin-markdown-theme-serene-rose/blob/0a26041/serene-rose.scss */
export const sereneRoseTheme = communityTheme({
  id: 'serene-rose',
  name: '静玫瑰',
  description: '改编自 serene-rose Markdown 样式',
  accent: '#ed7373',
  body: {
    fontSize: '16px',
    lineHeight: '1.75',
    color: '#252b3a',
  },
  heading: {
    fontWeight: '700',
    color: '#ed7373',
    lineHeight: '1.5',
    marginTop: '24px',
    marginBottom: '9.6px',
    decor: 'none',
  },
  headingSizes: {
    h1: '24px',
    h2: '20px',
    h3: '18px',
    h4: '16px',
    h5: '14px',
    h6: '14px',
  },
  pMargin: '22px',
  quote: {
    background: '#fdf2f2',
    color: '#252b3a',
    borderLeft: '4px solid #ed7373',
    padding: '1px 23px',
    margin: '22px 0',
  },
  code: {
    background: 'rgba(239,198,221,0.2666666667)',
    color: '#7b164f',
    padding: '0.065em 0.4em',
    fontSize: '0.87em',
  },
  codeBlock: {
    background: '#fdf8f8',
    color: '#252b3a',
    padding: '15px 12px',
    fontSize: '12px',
  },
  link: {
    color: '#ed7373',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#ed7373',
    headBg: '#fdf2f2',
    headColor: '#ed7373',
    fontSize: '12px',
    cellPadding: '12px 7px',
  },
  strongColor: '#ed7373',
})
