import { communityTheme } from './community'
import { SANS } from '../fonts'

/** 来源：https://github.com/wangly19/juejin-markdown-theme-greenwillow/blob/aca95ed/greenwillow.scss */
export const greenwillowTheme = communityTheme({
  id: 'greenwillow',
  name: '青柳',
  description: '改编自 greenwillow Markdown 样式',
  accent: '#77AF9C',
  accentSoft: 'rgba(119,175,156,.22)',
  body: {
    font: SANS,
    fontSize: '16px',
    lineHeight: '1.75',
    color: '#333',
  },
  heading: {
    font: SANS,
    fontWeight: '700',
    color: '#6E7783',
    lineHeight: '1.5',
    marginTop: '35px',
    marginBottom: '10px',
    decor: 'band',
  },
  headingSizes: {
    h1: '25.6px',
    h2: '22.4px',
    h3: '17.6px',
    h4: '16.6px',
    h5: '15.6px',
    h6: '14.6px',
  },
  pMargin: '18px',
  quote: {
    background: 'rgba(119,175,156,0.22)',
    color: '#888',
    borderLeft: '3px solid #77AF9C',
    padding: '10px',
    margin: '0',
  },
  code: {
    background: 'rgba(119,175,156,0.22)',
    color: '#333',
    padding: '2px 5px',
    fontSize: '0.9em',
  },
  codeBlock: {
    background: '#f8f8f8',
    color: '#6E7783',
    padding: '16px 12px',
    fontSize: '14.4px',
  },
  link: {
    color: '#77AF9C',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#77AF9C',
    headBg: 'rgba(119,175,156,0.22)',
    headColor: '#333',
    fontSize: '12.8px',
    cellPadding: '8px 12px',
  },
  strongColor: '#6E7783',
})
