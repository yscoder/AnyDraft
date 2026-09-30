import { communityTheme } from './community'

/** 来源：https://github.com/MageeLin/juejin-markdown-theme-geek-black/blob/888136c/geek-black.scss */
export const geekBlackTheme = communityTheme({
  id: 'geek-black',
  name: '极客黑',
  description: '改编自 geek-black Markdown 样式',
  accent: '#212122',
  accentSoft: '#212122',
  body: {
    fontSize: '16px',
    lineHeight: '1.7',
    color: 'rgb(33,33,34)',
  },
  heading: {
    fontWeight: '700',
    color: '#fff',
    lineHeight: '1.5',
    marginTop: '32px',
    marginBottom: '8px',
    decor: 'band',
  },
  headingSizes: {
    h1: '32px',
    h2: '30px',
    h3: '24px',
    h4: '20px',
    h5: '16px',
    h6: '16px',
  },
  pMargin: '16px',
  quote: {
    background: 'rgb(241,241,241)',
    color: 'rgb(119,119,119)',
    borderLeft: '4px solid rgb(198,196,196)',
    padding: '8px 16px',
    margin: '24px 0',
  },
  code: {
    background: 'rgb(241,241,241)',
    color: 'rgb(239,112,96)',
    padding: '0.065em 6px',
    fontSize: '14px',
  },
  codeBlock: {
    background: '#f8f8f8',
    color: '#333',
    padding: '16px 12px',
    fontSize: '14px',
  },
  link: {
    color: 'rgb(239,112,96)',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#c1c3d1',
    headBg: '#212121',
    headColor: '#fff',
    fontSize: '14px',
    cellPadding: '16px',
  },
  strongColor: '#212121',
})
