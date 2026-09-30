import { communityTheme } from './community'

/** 来源：https://github.com/RudeCrab/juejin-markdown-theme-rude-crab/blob/2a4524b/rude-crab.scss */
export const orangeTheme = communityTheme({
  id: 'orange',
  name: '活力橙',
  description: '改编自 orange Markdown 样式',
  accent: 'rgb(239,112,96)',
  body: {
    fontSize: '15px',
    lineHeight: '1.75',
    color: '#333',
  },
  heading: {
    fontWeight: '700',
    color: '#fff',
    lineHeight: '1.5',
    marginTop: '35px',
    marginBottom: '5px',
    decor: 'band',
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
    background: '#fff9f9',
    color: '#333',
    borderLeft: '3px solid rgb(239,112,96)',
    padding: '1px 20px',
    margin: '20px 0',
  },
  code: {
    background: 'rgba(27,31,35,0.05)',
    color: '#ff502c',
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
    color: 'rgb(239,112,96)',
    textDecoration: 'underline',
  },
  table: {
    borderColor: 'rgb(239,112,96)',
    headBg: '#f0f0f0',
    headColor: '#000',
    fontSize: '14px',
    cellPadding: '8px 12px',
  },
  strongColor: '#333',
  accentSoft: '#EF7060',
})
