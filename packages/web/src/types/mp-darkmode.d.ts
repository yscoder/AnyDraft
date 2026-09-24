declare module 'mp-darkmode' {
  export function run(
    nodes: HTMLElement[],
    options: {
      mode: 'dark'
      needJudgeFirstPage: boolean
      cssSelectorsPrefix: string
    },
  ): void
}
