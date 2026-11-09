// Run with DSH fully closed. The patched checkout is created by apply.mjs.
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, unlinkSync, constants } from 'node:fs'
import { basename, dirname, join, resolve, relative, isAbsolute } from 'node:path'

const original = {
  'src/inbound.js': '64af5c947ed52975c108cb326949faec3f7441f365ba848776e97fb93176d022',
  'src/index.js': 'f570542740d9d22cceec93edce0487e546d8943ab0e00d7a95452d3c2404a114',
  'src/onebot/segment.js': '1b0459ca99cbcfbc2a3d528e51ad3a0e2d206901210abfdc7041e68841951b04',
  'src/prompts.js': 'f87d6c09887d3f0482c95a68c0f201425a76b6e624260e8bc2001ee499b8b559',
  'src/sleep.js': '81799e24b0069192239ecfa8da4f53686367c83dbb77fa6deaf0141c14feea16',
}
const patched = {
  'src/inbound.js': '749f009c8c81552a184567ed3b873f343eae8b5b2d658779765964c1d7779d70',
  'src/index.js': 'c88f65f97d93fb7f43c5388ecb1adbc97a1a514293ad63a66d886e3ff04d90cf',
  'src/onebot/segment.js': 'ef177a4f0c77a1e927435e29714f5a6f174ca134e3f701d42f784b315f637802',
  'src/prompts.js': '14de0b2f19646f88279112cd586d8173e07bb135ed9601de5742275c57218a62',
  'src/sleep.js': 'fe2e904cf126a1663abe316e19475a39b90469a191b003fad7dff8cf4224c8eb',
  'src/native-images.js': '53a30e2f0a4f265e68c13c2818a0afc73d82d680fd46eaa9e35ac0c6c6d9c170',
}
const [mode, directory, backupArg, checkout] = process.argv.slice(2)
if (!['install','rollback'].includes(mode) || !directory || !backupArg || (mode === 'install' && !checkout))
  throw Error('Usage: node install.mjs install <plugin> <new-backup-dir> <patched-checkout> OR node install.mjs rollback <plugin> <backup-dir>')
const target = realpathSync(directory)
const backup = mode === 'install' ? join(realpathSync(dirname(resolve(backupArg))), basename(resolve(backupArg))) : realpathSync(backupArg)
const rel = relative(target, backup)
if (!isAbsolute(rel) && !/^\.\.(?:[\\/]|$)/.test(rel)) throw Error('Choose a backup directory outside the installed plugin')
const manifest = JSON.parse(readFileSync(join(target, 'package.json')))
if (manifest.name !== 'dsh-qq-onebot' || manifest.version !== '1.3.0') throw Error('Expected dsh-qq-onebot 1.3.0')
function check(root, name, digest, normalize = false) {
  const path = join(root, name)
  if (realpathSync(path) !== path) throw Error('Unexpected link: ' + name)
  const bytes = readFileSync(path)
  if (createHash('sha256').update(normalize ? bytes.toString('utf8').replaceAll('\r\n','\n') : bytes).digest('hex') !== digest)
    throw Error('Checksum mismatch: ' + name)
}
const extra = 'src/native-images.js'
if (mode === 'install') {
  const source = realpathSync(checkout)
  for (const [file, digest] of Object.entries(patched)) check(source, file, digest)
  for (const [file, digest] of Object.entries(original)) check(target, file, digest, true)
  if (existsSync(join(target, extra))) throw Error('New module already exists')
  mkdirSync(backup)
  for (const [file, digest] of Object.entries(original)) {
    mkdirSync(dirname(join(backup, file)), { recursive:true })
    copyFileSync(join(target,file), join(backup,file), constants.COPYFILE_EXCL)
    check(backup,file,digest,true)
  }
  let added = false
  try {
    for (const [file,digest] of Object.entries(patched)) {
      copyFileSync(join(source,file), join(target,file), file === extra ? constants.COPYFILE_EXCL : 0)
      if (file === extra) added = true
      check(target,file,digest)
    }
  } catch (err) {
    for (const file of Object.keys(original)) copyFileSync(join(backup,file), join(target,file))
    if (added) unlinkSync(join(target,extra))
    throw err
  }
  console.log('Installed and verified six files. Keep the backup for rollback.')
} else {
  for (const [file,digest] of Object.entries(original)) check(backup,file,digest,true)
  // Accept already restored files so an interrupted rollback can be retried.
  for (const file of Object.keys(original)) {
    try { check(target,file,patched[file]) } catch { check(target,file,original[file],true) }
  }
  if (existsSync(join(target,extra))) check(target,extra,patched[extra])
  for (const [file,digest] of Object.entries(original)) {
    copyFileSync(join(backup,file), join(target,file))
    check(target,file,digest,true)
  }
  if (existsSync(join(target,extra))) unlinkSync(join(target,extra))
  console.log('Rollback verified. Start DSH when ready.')
}
