import { SANS } from '../fonts'
import { communityTheme } from './community'

/** 来源：https://github.com/ChanningHan/juejin-markdown-theme-channing-cyan/blob/c843c2f/channing-cyan.scss */
export const channingCyanTheme = communityTheme({
  id: 'channing-cyan',
  name: '青蓝',
  description: '改编自 channing-cyan Markdown 样式',
  accent: '#4dd0e1',
  body: {
    font: SANS,
    fontSize: '15px',
    lineHeight: '1.75',
    color: '#2b2b2b',
  },
  heading: {
    font: SANS,
    fontWeight: '700',
    color: '#4dd0e1',
    lineHeight: '1.5',
    marginTop: '35px',
    marginBottom: '10px',
    decor: 'underline',
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
    background: 'rgba(77,208,225,.15)',
    color: '#2b2b2b',
    borderLeft: '4px solid #26c6da',
    padding: '24px 32px',
    margin: '2em 0',
  },
  code: {
    background: 'rgba(77,208,225,0.08)',
    color: '#26c6da',
    padding: '0.195em 0.4em',
    fontSize: '0.9em',
  },
  codeBlock: {
    background: '#f8f8f8',
    color: '#333',
    padding: '15px 12px',
    fontSize: '12px',
  },
  link: {
    color: '#4dd0e1',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#f6f6f6',
    headBg: '#f6f6f6',
    headColor: '#000',
    fontSize: '12px',
    cellPadding: '12px 7px',
  },
  strongColor: '#26c6da',
})
