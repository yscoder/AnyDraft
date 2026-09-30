import { SANS } from '../fonts'
import { communityTheme } from './community'

/** 来源：https://github.com/cumt-robin/juejin-markdown-theme-smart-blue/blob/f266ca5/smart-blue.css */
export const smartblueTheme = communityTheme({
  id: 'smartblue',
  name: '智蓝',
  description: '改编自 smartblue Markdown 样式',
  accent: '#036aca',
  body: {
    font: SANS,
    fontSize: '15px',
    lineHeight: '1.75',
    color: '#595959',
  },
  heading: {
    font: SANS,
    fontWeight: '700',
    color: '#135ce0',
    lineHeight: '1.5',
    marginTop: '30px',
    marginBottom: '12px',
    decor: 'left-bar',
  },
  headingSizes: {
    h1: '22px',
    h2: '20px',
    h3: '16px',
    h4: '15px',
    h5: '14px',
    h6: '13px',
  },
  pMargin: '18px',
  quote: {
    background: '#fff9f9',
    color: '#595959',
    borderLeft: '4px solid #b2aec5',
    padding: '2px 20px',
    margin: '2em 0',
  },
  code: {
    background: '#fff5f5',
    color: '#ff502c',
    padding: '.065em .4em',
    fontSize: '.87em',
  },
  codeBlock: {
    background: '#f8f8f8',
    color: '#333',
    padding: '15px 12px',
    fontSize: '12px',
  },
  link: {
    color: '#036aca',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#dfe2e5',
    headBg: '#fff9f9',
    headColor: '#595959',
    fontSize: '14px',
    cellPadding: '.6em 1em',
  },
  strongColor: '#036aca',
})
