import { communityTheme } from './community'

/** 来源：https://github.com/DawnLck/juejin-markdown-theme-v-green/blob/015f88b/v-green.scss */
export const vGreenTheme = communityTheme({
  id: 'v-green',
  name: 'Vue',
  description: '改编自 v-green Markdown 样式',
  accent: '#3eaf7c',
  body: {
    fontSize: '15px',
    lineHeight: '1.75',
    color: '#333',
  },
  heading: {
    fontWeight: '700',
    color: '#333',
    lineHeight: '1.5',
    marginTop: '35px',
    marginBottom: '5px',
    decor: 'symbol',
  },
  headingSizes: {
    h1: '28px',
    h2: '24px',
    h3: '20px',
    h4: '16px',
    h5: '14px',
    h6: '13px',
  },
  pMargin: '22px',
  quote: {
    background: '#f8f8f8',
    color: '#666',
    borderLeft: '0.5rem solid rgba(62,175,124,0.6)',
    padding: '1px 23px',
    margin: '22px 0',
  },
  code: {
    background: 'rgba(27,31,35,0.05)',
    color: '#3eaf7c',
    padding: '0.2rem 0.5rem',
    fontSize: '0.85em',
  },
  codeBlock: {
    background: '#f8f8f8',
    color: '#333',
    padding: '15px 12px',
    fontSize: '12px',
  },
  link: {
    color: '#3eaf7c',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#3eaf7c',
    headBg: '#eaf5f0',
    headColor: '#3eaf7c',
    fontSize: '12px',
    cellPadding: '12px 7px',
  },
  strongColor: '#3eaf7c',
})
