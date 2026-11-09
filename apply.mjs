import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, copyFileSync, existsSync, readFileSync, realpathSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = '224ad59603b176580241b45d3f1b3ec53a5d7eeb'
const patch = fileURLToPath(new URL('./patches/native-vision.patch', import.meta.url))
const test = fileURLToPath(new URL('./tests/vision-native.test.mjs', import.meta.url))
const expected = {
  'src/inbound.js': '749f009c8c81552a184567ed3b873f343eae8b5b2d658779765964c1d7779d70',
  'src/index.js': 'c88f65f97d93fb7f43c5388ecb1adbc97a1a514293ad63a66d886e3ff04d90cf',
  'src/native-images.js': '53a30e2f0a4f265e68c13c2818a0afc73d82d680fd46eaa9e35ac0c6c6d9c170',
  'src/onebot/segment.js': 'ef177a4f0c77a1e927435e29714f5a6f174ca134e3f701d42f784b315f637802',
  'src/prompts.js': '14de0b2f19646f88279112cd586d8173e07bb135ed9601de5742275c57218a62',
  'src/sleep.js': 'fe2e904cf126a1663abe316e19475a39b90469a191b003fad7dff8cf4224c8eb',
}
function hash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}
if (process.argv.length !== 3) throw Error('Usage: node apply.mjs <clean upstream checkout>')
const dir = realpathSync(process.argv[2])
const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
if (realpathSync(resolve(git('rev-parse', '--show-toplevel'))) !== dir || git('rev-parse', 'HEAD') !== base)
  throw Error('Expected the root of an upstream checkout at ' + base)
if (git('status', '--porcelain', '--untracked-files=all')) throw Error('Checkout must be clean')
const installedTest = join(dir, 'test', 'vision-native.test.mjs')
if (existsSync(installedTest) || existsSync(join(dir, 'src/native-images.js'))) throw Error('New file path already exists')
if (hash(patch) !== '870c7070b6bfac805f158396c44ea6406f505ea973f29cb307e1398b553d41be')
  throw Error('Patch checksum mismatch; use LF line endings')
git('apply', '--check', '--unidiff-zero', patch)
git('apply', '--unidiff-zero', patch)
let copied = false
try {
  for (const [file, digest] of Object.entries(expected)) {
    if (hash(join(dir, file)) !== digest) throw Error('Unexpected output for ' + file + '; use an LF checkout')
  }
  copyFileSync(test, installedTest, constants.COPYFILE_EXCL)
  copied = true
  if (hash(installedTest) !== hash(test)) throw Error('Test checksum mismatch')
} catch (error) {
  if (copied) unlinkSync(installedTest)
  git('apply', '--reverse', '--unidiff-zero', patch)
  throw error
}
console.log('Six verified source files patched; regression test installed in the upstream checkout.')
