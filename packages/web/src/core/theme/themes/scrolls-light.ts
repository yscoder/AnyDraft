import { communityTheme } from './community'

/** 来源：https://github.com/daodaolee/juejin-markdown-theme-scrolls/blob/cebc694/scrolls.scss */
export const scrollsLightTheme = communityTheme({
  id: 'scrolls-light',
  name: '卷轴浅金',
  description: '改编自 scrolls-light Markdown 样式',
  accent: '#d8ac5a',
  body: {
    fontSize: '15px',
    lineHeight: '1.75',
    color: '#333',
  },
  heading: {
    fontWeight: '700',
    color: '#cca152',
    lineHeight: '1.5',
    marginTop: '30px',
    marginBottom: '12px',
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
    background: '#fff7e5',
    color: '#bd954f',
    borderLeft: '4px solid #dcb267',
    padding: '1px 23px',
    margin: '22px 0',
  },
  code: {
    background: '#f6efde',
    color: '#b69454',
    padding: '0.065em 0.4em',
    fontSize: '0.87em',
  },
  codeBlock: {
    background: '#fef6e1',
    color: '#333',
    padding: '15px 12px',
    fontSize: '12px',
  },
  link: {
    color: '#d8ac5a',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#f4e8c7',
    headBg: 'rgba(255,227,176,0.6588235294)',
    headColor: '#333',
    fontSize: '12px',
    cellPadding: '7px',
  },
  strongColor: '#cca152',
})
