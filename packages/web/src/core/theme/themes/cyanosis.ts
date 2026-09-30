import { communityTheme } from './community'

/** 来源：https://github.com/linxsbox/juejin-markdown-theme-cyanosis/blob/044b052/cyanosis.scss */
export const cyanosisTheme = communityTheme({
  id: 'cyanosis',
  name: '蓝调',
  description: '改编自 cyanosis Markdown 样式',
  accent: '#3da8f5',
  body: {
    fontSize: '14px',
    lineHeight: '1.75',
    color: '#353535',
  },
  heading: {
    fontWeight: '700',
    color: '#005bb7',
    lineHeight: '1.5',
    marginTop: '36px',
    marginBottom: '10px',
    decor: 'none',
  },
  headingSizes: {
    h1: '30px',
    h2: '24px',
    h3: '20px',
    h4: '16px',
    h5: '14px',
    h6: '12px',
  },
  pMargin: '16px',
  quote: {
    background: '#f0fdff',
    color: '#8c8c8c',
    borderLeft: '4px solid #2196f3',
    padding: '1px 20px',
    margin: '22px 0',
  },
  code: {
    background: '#fff4f4',
    color: '#c2185b',
    padding: '0.065em 0.4em',
    fontSize: '0.87em',
  },
  codeBlock: {
    background: '#f8f8f8',
    color: '#333',
    padding: '16px 12px',
    fontSize: '12px',
  },
  link: {
    color: '#3da8f5',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#c3e0fd',
    headBg: '#dff0ff',
    headColor: '#005bb7',
    fontSize: '12px',
    cellPadding: '12px 8px',
  },
  strongColor: '#2196f3',
})
