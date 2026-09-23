#!/usr/bin/env node
/**
 * 一键统一更新各处版本号。
 *
 * 用法：
 *   node scripts/set-version.js <version>
 *   npm run set-version -- 0.2.0
 *   npm run set-version -- 0.2.0 --dry-run
 *
 * 参数：
 *   <version>   必填，语义化版本号，如 1.2.3 / 1.2.3-beta.1
 *   --dry-run   只打印将要发生的改动，不写入文件
 *   -h, --help  打印帮助
 *
 * 覆盖位置：
 *   - 根 package.json
 *   - packages/web/package.json
 *   - packages/desktop/package.json
 *   - packages/desktop/src-tauri/tauri.conf.json
 *   - packages/desktop/src-tauri/Cargo.toml（[package] 段）
 *   - packages/desktop/src-tauri/Cargo.lock（同名 package 块）
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/

/** JSON 文件：只匹配根层级（两个空格缩进）的 "version" 字段，避免改到 dependencies */
const JSON_VERSION_RE = /^([ \t]{2}"version"[ \t]*:[ \t]*")([^"]*)(")/m
/** TOML 文件：version = "x.y.z" */
const TOML_VERSION_RE = /^(version[ \t]*=[ \t]*")([^"]*)(")/m

const TARGETS = [
  { label: 'root package.json', file: 'package.json', kind: 'json' },
  {
    label: 'web package.json',
    file: 'packages/web/package.json',
    kind: 'json',
  },
  {
    label: 'desktop package.json',
    file: 'packages/desktop/package.json',
    kind: 'json',
  },
  {
    label: 'tauri.conf.json',
    file: 'packages/desktop/src-tauri/tauri.conf.json',
    kind: 'json',
  },
  {
    label: 'Cargo.toml',
    file: 'packages/desktop/src-tauri/Cargo.toml',
    kind: 'cargo-toml',
  },
  {
    label: 'Cargo.lock',
    file: 'packages/desktop/src-tauri/Cargo.lock',
    kind: 'cargo-lock',
  },
]

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 替换文本中第一个匹配到的版本值，保持原有缩进与换行格式不变 */
export function patchFirstMatch(text, regex, next) {
  const match = text.match(regex)
  if (!match) return null
  const [full, prefix, previous, suffix] = match
  const start = match.index ?? text.indexOf(full)
  const patched =
    text.slice(0, start) +
    prefix +
    next +
    suffix +
    text.slice(start + full.length)
  return { text: patched, previous, next, changed: previous !== next }
}

/** 只替换 Cargo.toml [package] 段内的 version，避免命中依赖的 version */
export function patchCargoToml(text, next) {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => /^\[package\][ \t]*$/.test(line))
  if (start === -1) return null

  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\[.+\][ \t]*$/.test(lines[i])) break
    const match = lines[i].match(TOML_VERSION_RE)
    if (!match) continue
    const [, prefix, previous, suffix] = match
    lines[i] = prefix + next + suffix
    return {
      text: lines.join('\n'),
      previous,
      next,
      changed: previous !== next,
    }
  }
  return null
}

/** 只替换 Cargo.lock 中指定 package 块内的 version */
export function patchCargoLock(text, next, packageName) {
  const lines = text.split('\n')
  const nameRe = new RegExp(
    `^name[ \t]*=[ \t]*"${escapeRegExp(packageName)}"[ \t]*$`,
  )
  const nameIndex = lines.findIndex((line) => nameRe.test(line))
  if (nameIndex === -1) return null

  for (let i = nameIndex + 1; i < lines.length; i += 1) {
    if (/^\[\[package\]\][ \t]*$/.test(lines[i])) break
    const match = lines[i].match(TOML_VERSION_RE)
    if (!match) continue
    const [, prefix, previous, suffix] = match
    lines[i] = prefix + next + suffix
    return {
      text: lines.join('\n'),
      previous,
      next,
      changed: previous !== next,
    }
  }
  return null
}

export function readCargoPackageName(text) {
  const match = text.match(/^name[ \t]*=[ \t]*"([^"]+)"[ \t]*$/m)
  return match ? match[1] : null
}

export function parseArgs(argv) {
  const positional = []
  let dryRun = false
  let help = false

  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '-n') {
      dryRun = true
    } else if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg.startsWith('-')) {
      throw new Error(`未知参数：${arg}`)
    } else {
      positional.push(arg)
    }
  }

  if (help || positional.length === 0)
    return { help: true, dryRun, version: null }
  if (positional.length > 1) {
    throw new Error(`只接受一个版本号参数，收到：${positional.join(', ')}`)
  }

  const version = positional[0]
  if (!SEMVER_RE.test(version)) {
    throw new Error(
      `版本号不合法：${version}（应为 x.y.z，可带 -beta.1 之类的后缀）`,
    )
  }

  return { help: false, dryRun, version }
}

export function patchByKind(text, kind, version, options = {}) {
  switch (kind) {
    case 'json': {
      const result = patchFirstMatch(text, JSON_VERSION_RE, version)
      if (result && JSON.parse(result.text).version !== version) {
        throw new Error('替换后校验失败：JSON 根级 version 字段未更新')
      }
      return result
    }
    case 'cargo-toml':
      return patchCargoToml(text, version)
    case 'cargo-lock':
      return patchCargoLock(text, version, options.cargoName)
    default:
      throw new Error(`未知的文件类型：${kind}`)
  }
}

function printHelp() {
  process.stdout.write(
    [
      '用法：node scripts/set-version.js <version> [--dry-run]',
      '',
      '示例：',
      '  npm run set-version -- 0.2.0',
      '  npm run set-version -- 0.2.0 --dry-run',
      '',
    ].join('\n'),
  )
}

async function main() {
  let parsed
  try {
    parsed = parseArgs(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error.message}\n\n`)
    printHelp()
    process.exitCode = 1
    return
  }

  if (parsed.help) {
    printHelp()
    process.exitCode = parsed.version ? 0 : 1
    return
  }

  const { version, dryRun } = parsed
  const cargoTomlPath = join(rootDir, 'packages/desktop/src-tauri/Cargo.toml')
  const cargoName = readCargoPackageName(await readFile(cargoTomlPath, 'utf8'))

  const updated = []
  for (const target of TARGETS) {
    const filePath = join(rootDir, target.file)
    const text = await readFile(filePath, 'utf8')
    const result = patchByKind(text, target.kind, version, { cargoName })

    if (!result) {
      process.stderr.write(`✗ ${target.label}：未找到版本字段，已跳过\n`)
      continue
    }

    if (!result.changed) {
      process.stdout.write(`· ${target.label}：已是 ${result.previous}\n`)
      continue
    }

    if (!dryRun) {
      await writeFile(filePath, result.text)
    }
    updated.push(target.label)
    process.stdout.write(
      `${dryRun ? '∼' : '✓'} ${target.label}：${result.previous} → ${result.next}\n`,
    )
  }

  const suffix = dryRun ? '（dry-run，未写入）' : ''
  process.stdout.write(`\n共更新 ${updated.length} 处${suffix}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
