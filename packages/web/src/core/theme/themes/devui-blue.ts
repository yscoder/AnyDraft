import { communityTheme } from './community'

/** 来源：https://github.com/kagol/juejin-markdown-theme-devui-blue/blob/bb59b1b/devui-blue.scss */
export const devuiBlueTheme = communityTheme({
  id: 'devui-blue',
  name: 'DevUI 蓝',
  description: '改编自 devui-blue Markdown 样式',
  accent: '#5E7CE0',
  body: {
    fontSize: '16px',
    lineHeight: '1.75',
    color: '#252b3a',
  },
  heading: {
    fontWeight: '700',
    color: '#5E7CE0',
    lineHeight: '1.5',
    marginTop: '20px',
    marginBottom: '5px',
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
    background: '#F2F5FC',
    color: '#252b3a',
    borderLeft: '4px solid #5E7CE0',
    padding: '1px 23px',
    margin: '22px 0',
  },
  code: {
    background: '#FFEEED',
    color: '#C73636',
    padding: '0.065em 0.4em',
    fontSize: '0.87em',
  },
  codeBlock: {
    background: '#f8f8f8',
    color: '#252b3a',
    padding: '15px 12px',
    fontSize: '12px',
  },
  link: {
    color: '#5E7CE0',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#5E7CE0',
    headBg: '#F2F5FC',
    headColor: '#5E7CE0',
    fontSize: '12px',
    cellPadding: '12px 7px',
  },
  strongColor: '#5E7CE0',
})
