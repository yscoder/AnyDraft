import { SANS } from '../fonts'
import { communityTheme } from './community'

/** 来源：https://github.com/sindresorhus/github-markdown-css/blob/888d5a0/github-markdown.css */
export const githubTheme = communityTheme({
  id: 'github',
  name: 'GitHub',
  description: '改编自 github Markdown 样式',
  accent: '#0366d6',
  body: {
    font: SANS,
    fontSize: '16px',
    lineHeight: '1.5',
    color: '#24292e',
  },
  heading: {
    font: SANS,
    fontWeight: '600',
    color: '#24292e',
    lineHeight: '1.25',
    marginTop: '24px',
    marginBottom: '16px',
    decor: 'none',
  },
  headingSizes: {
    h1: '32px',
    h2: '24px',
    h3: '20px',
    h4: '16px',
    h5: '14px',
    h6: '13.6px',
  },
  pMargin: '16px',
  quote: {
    background: '#f8f8f8',
    color: '#6a737d',
    borderLeft: '.25em solid #dfe2e5',
    padding: '0 1em',
    margin: '0',
  },
  code: {
    background: 'rgba(27,31,35,.05)',
    color: '#24292e',
    padding: '.2em .4em',
    fontSize: '85%',
  },
  codeBlock: {
    background: '#f8f8f8',
    color: '#24292e',
    padding: '14px 16px',
    fontSize: '14px',
  },
  link: {
    color: '#0366d6',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#dfe2e5',
    headBg: '#f8f8f8',
    headColor: '#24292e',
    fontSize: '14px',
    cellPadding: '8px 12px',
  },
  strongColor: '#24292e',
})
