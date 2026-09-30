import { communityTheme } from './community'

/** 来源：https://github.com/sheng1998/juejin-markdown-theme-z-blue/blob/9057224/z-blue.scss */
export const zBlueTheme = communityTheme({
  id: 'z-blue',
  name: 'Z 蓝',
  description: '改编自 z-blue Markdown 样式',
  accent: '#3c9dff',
  body: {
    fontSize: '15px',
    lineHeight: '1.75',
    color: '#333',
  },
  heading: {
    fontWeight: '700',
    color: '#3c9dff',
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
    background: 'rgba(190,221,255,0.3)',
    color: '#1a1b1c',
    borderLeft: '4px solid rgba(60,157,255,0.5)',
    padding: '1px 20px',
    margin: '22px 0',
  },
  code: {
    background: '#d2e8ff',
    color: '#3c9dff',
    padding: '0.1em 0.5em',
    fontSize: '0.9em',
  },
  codeBlock: {
    background: '#f8f8f8',
    color: '#333',
    padding: '15px 12px',
    fontSize: '12px',
  },
  link: {
    color: '#3c9dff',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#3c9dff',
    headBg: 'rgba(190,221,255,0.3)',
    headColor: '#333',
    fontSize: '12px',
    cellPadding: '12px 7px',
  },
  strongColor: '#3c9dff',
})
