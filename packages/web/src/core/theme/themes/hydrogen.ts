import { communityTheme } from './community'

/** 来源：https://github.com/DawnLck/juejin-markdown-theme-hydrogen/blob/b3f86fb/hydrogen.scss */
export const hydrogenTheme = communityTheme({
  id: 'hydrogen',
  name: '氢',
  description: '改编自 hydrogen Markdown 样式',
  accent: '#454545',
  body: {
    fontSize: '16px',
    lineHeight: '1.75',
    color: 'rgba(46,36,36,0.87)',
  },
  heading: {
    fontWeight: '500',
    color: 'rgba(46,36,36,0.87)',
    lineHeight: '1.5',
    marginTop: '30px',
    marginBottom: '12px',
    decor: 'left-bar',
  },
  headingSizes: {
    h1: '30px',
    h2: '28px',
    h3: '24px',
    h4: '20px',
    h5: '16px',
    h6: '16px',
  },
  pMargin: '22px',
  quote: {
    background: 'rgba(200,200,200,0.12)',
    color: '#666',
    borderLeft: '4px solid #cbcbcb',
    padding: '5px 23px 1px',
    margin: '22px 0',
  },
  code: {
    background: '#fbe5e1',
    color: '#c0341d',
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
    color: '#027fff',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#c6c6c6',
    headBg: '#f6f6f6',
    headColor: '#000',
    fontSize: '12px',
    cellPadding: '12px 7px',
  },
  strongColor: 'rgba(46,36,36,0.87)',
})
