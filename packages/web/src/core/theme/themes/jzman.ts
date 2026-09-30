import { communityTheme } from './community'

/** 来源：https://github.com/jzmanu/juejin-markdown-theme-jzman/blob/b8cf058/jzman.scss */
export const jzmanTheme = communityTheme({
  id: 'jzman',
  name: '简致',
  description: '改编自 jzman Markdown 样式',
  accent: '#0269c8',
  body: {
    fontSize: '16px',
    lineHeight: '1.8',
    color: '#3e3e3e',
  },
  heading: {
    fontWeight: '700',
    color: '#3e3e3e',
    lineHeight: '1.5',
    marginTop: '30px',
    marginBottom: '5px',
    decor: 'none',
  },
  headingSizes: {
    h1: '30px',
    h2: '24px',
    h3: '18px',
    h4: '17px',
    h5: '15px',
    h6: '14px',
  },
  pMargin: '22px',
  quote: {
    background: '#f8f8f8',
    color: '#666',
    borderLeft: '4px solid #cbcbcb',
    padding: '1px 23px',
    margin: '22px 0',
  },
  code: {
    background: '#fff5f5',
    color: '#ff502c',
    padding: '0.065em 0.4em',
    fontSize: '0.87em',
  },
  codeBlock: {
    background: '#f8f8f8',
    color: '#333',
    padding: '15px 12px',
    fontSize: '12px',
  },
  link: {
    color: '#0269c8',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#d6d6d6',
    headBg: '#f6f6f6',
    headColor: '#000',
    fontSize: '12px',
    cellPadding: '12px 7px',
  },
  strongColor: '#3e3e3e',
})
