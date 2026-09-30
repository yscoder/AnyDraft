import { MONO } from '../fonts'
import { communityTheme } from './community'

/** 来源：https://github.com/SnakeLil/juejin-markdown-theme-lilsnake/blob/d9dbeb8/lilsnake.scss */
export const lilsnakeTheme = communityTheme({
  id: 'lilsnake',
  name: '小蛇黑',
  description: '改编自 lilsnake Markdown 样式',
  accent: 'gray',
  body: {
    fontSize: '16px',
    lineHeight: '1.75',
    color: '#444444',
  },
  heading: {
    font: MONO,
    fontWeight: 'bold',
    color: '#444444',
    lineHeight: '1.5',
    marginTop: '34px',
    marginBottom: '14px',
    decor: 'left-bar',
  },
  headingSizes: {
    h1: '41px',
    h2: '30px',
    h3: '24px',
    h4: '20px',
    h5: '16px',
    h6: '14px',
  },
  pMargin: '12.8px',
  quote: {
    background: 'lightgray',
    color: '#444444',
    borderLeft: '0.2em solid black',
    padding: '5px 10px',
    margin: '0.8em 0',
  },
  code: {
    background: 'rgba(69,69,77,0.8)',
    color: 'white',
    padding: '0.07em 0.4em',
    fontSize: '0.87em',
  },
  codeBlock: {
    background: '#171717',
    color: '#bababa',
    padding: '20px',
    fontSize: '14px',
  },
  link: {
    color: 'gray',
    textDecoration: 'underline',
  },
  table: {
    borderColor: '#ddd',
    headBg: 'lightgray',
    headColor: '#444444',
    fontSize: '14px',
    cellPadding: '8px',
  },
  strongColor: '#444444',
})
