import { SERIF } from '../fonts'
import { communityTheme } from './community'

/** 来源：https://github.com/viewweiwu/juejin-markdown-theme-arknights/blob/c7285a1/arknights.scss */
export const arknightsTheme = communityTheme({
  id: 'arknights',
  name: '明日方舟',
  description: '改编自 arknights Markdown 样式',
  accent: '#37b2ff',
  body: {
    fontSize: '15px',
    lineHeight: '1.75',
    color: '#333',
  },
  heading: {
    font: SERIF,
    fontWeight: '900',
    color: '#000',
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
    background: 'transparent',
    color: '#666',
    borderLeft: '1px solid #37b2ff',
    padding: '12px 23px 2px',
    margin: '22px 0',
  },
  code: {
    background: '#fff7f7',
    color: '#f06',
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
    color: '#37b2ff',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#37b2ff',
    headBg: '#fff',
    headColor: '#333',
    fontSize: '12px',
    cellPadding: '12px 7px',
  },
  strongColor: '#000',
})
