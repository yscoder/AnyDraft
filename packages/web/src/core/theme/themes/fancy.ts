import { SANS } from '../fonts'
import { communityTheme } from './community'

/** 来源：https://github.com/xrr2016/juejin-markdown-theme-fancy/blob/65aefc5/fancy.scss */
export const fancyTheme = communityTheme({
  id: 'fancy',
  name: '幻紫',
  description: '改编自 fancy Markdown 样式',
  accent: '#a862ea',
  body: {
    font: SANS,
    fontSize: '15px',
    lineHeight: '2',
    color: '#383838',
  },
  heading: {
    font: SANS,
    fontWeight: '700',
    color: '#a862ea',
    lineHeight: '2',
    marginTop: '30px',
    marginBottom: '12px',
    decor: 'none',
  },
  headingSizes: {
    h1: '21px',
    h2: '18px',
    h3: '16.5px',
    h4: '15.5px',
    h5: '14.5px',
    h6: '13.5px',
  },
  pMargin: '18px',
  quote: {
    background: '#f8f5ff',
    color: '#383838',
    borderLeft: '3px solid #a862ea',
    padding: '0.5em 1em',
    margin: '12px 0',
  },
  code: {
    background: '#f8f5ff',
    color: '#a862ea',
    padding: '2px 0.4em',
    fontSize: '0.9em',
  },
  codeBlock: {
    background: '#f8f8f8',
    color: '#383838',
    padding: '1.5em',
    fontSize: '13.5px',
  },
  link: {
    color: '#a862ea',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#e7daff',
    headBg: '#f8f5ff',
    headColor: '#a862ea',
    fontSize: '12px',
    cellPadding: '0.5em',
  },
  strongColor: '#a862ea',
})
