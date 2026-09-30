import { communityTheme } from './community'

/** 来源：https://github.com/Mancuoj/juejin-markdown-theme-Chinese-red/blob/6da886e/Chinese-red.scss */
export const ChineseRedTheme = communityTheme({
  id: 'Chinese-red',
  name: '中国红',
  description: '改编自 Chinese-red Markdown 样式',
  accent: '#f33b1f',
  accentSoft: '#f33b1f',
  body: {
    fontSize: '17px',
    lineHeight: '2',
    color: 'black',
  },
  heading: {
    fontWeight: 'bold',
    color: '#333',
    lineHeight: '1.5',
    marginTop: '30px',
    marginBottom: '20px',
    decor: 'symbol',
  },
  headingSizes: {
    h1: '32px',
    h2: '28px',
    h3: '24px',
    h4: '20px',
    h5: '17px',
    h6: '16px',
  },
  pMargin: '18px',
  quote: {
    background: '#fff9f9',
    color: '#3d3d3d',
    borderLeft: '3px solid #f07c82',
    padding: '6px 16px',
    margin: '16px 0',
  },
  code: {
    background: '#f9f1db',
    color: '#ee2746',
    padding: '1px 2px',
    fontSize: '16px',
  },
  codeBlock: {
    background: '#f7f7f7',
    color: '#333',
    padding: '16px 12px',
    fontSize: '15px',
  },
  link: {
    color: '#1781b5',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#f9f1db',
    headBg: '#fff9f9',
    headColor: 'black',
    fontSize: '14px',
    cellPadding: '12px 7px',
  },
  strongColor: '#ee3f4d',
})
