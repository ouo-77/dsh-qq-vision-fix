import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import sharp from 'sharp'
import { Context } from '@deepseek-ai/cordis'
import { LocalAttachmentStore } from '@deepseek-ai/dsh-attachment-local'
import { DeepSeekAdapter, resolveAdapterOptions } from '@deepseek-ai/dsh-llm-deepseek'
import { createInbound } from '../src/inbound.js'
import { loadImages } from '../src/native-images.js'
import { createSleep } from '../src/sleep.js'

const root = await mkdtemp(join(tmpdir(), 'qq-vision-'))
after(() => rm(root, { recursive: true, force: true }))
const store = new LocalAttachmentStore(new Context(), { dshHome: root })
const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } }).png().toBuffer()
const source = 'base64://' + png.toString('base64')
const text = text => ({ type: 'text', data: { text } })
const image = (url = source) => ({ type: 'image', data: { url } })

function harness(factory = createInbound, config = {}) {
  const messages = [], errors = [], jobs = []
  const record = { dir: root, chatPromptInjected: true, history: [], recent: [],
    agent: { followup: msg => messages.push(msg) } }
  const handle = factory({ config: { privateMode: 'open', replyToPrivate: true,
    chatLog: false, mergeWindowMs: 0, ...config }, logger: {},
    getAttachments: () => store, send: async (_, msg) => errors.push(msg),
    manager: { obtain: async () => record, enqueue: (_, job) => jobs.push(job()) } })
  return { messages, errors, jobs, post: (message, extra) => handle({
    post_type: 'message', message_type: 'private', user_id: 12, self_id: 13, message, ...extra }) }
}

test('a missing attachment service rejects the image before delivery', async () => {
  await assert.rejects(loadImages([source], undefined, root, 1), /附件服务不可用/)
})

test('private merge preserves interleaving and literal placeholder text', async () => {
  const h = harness(createInbound, { mergeWindowMs: 35 })
  await Promise.all([h.post([text('A[图片]'), image(), text('B')]), h.post('[CQ:image,file=' + source + ']C')])
  await delay(80); await Promise.all(h.jobs)
  assert.equal(h.messages.length, 1)
  const blocks = h.messages[0].content
  assert.deepEqual(blocks.map(p => p.type), ['text','image','text','image','text'])
  assert.match(blocks[0].text, /A\[图片\]$/)
  assert.match(blocks[2].text, /^B/)
  assert.match(blocks[4].text, /^C/)
  assert.match(blocks[1].attachment.attachmentId, /^sha256:/)
  assert.deepEqual(Object.keys(blocks[1]).sort(), ['attachment','type'])
  assert.ok((await readdir(join(root,'图片缓存'))).some(n => n.startsWith('qq-')))
})

test('real Flash adapter sends image bytes in outbound Messages JSON', async t => {
  const h = harness()
  await h.post([image()]); await Promise.all(h.jobs)
  assert.equal(h.messages[0].content.filter(p => p.type === 'image').length, 1)
  const model = 'deepseek-flash'
  const connection = resolveAdapterOptions({ models: [{ id: model, inputModalities: ['text','image'] }] })
  const adapter = new DeepSeekAdapter({ options: () => connection, resolveAttachments: () => store,
    resolveAuth: async () => ({ headers: {} }), resolveUserId: () => 'test',
    prepareExtensions: async () => ({ fields: {} }),
    resolveFiles: () => ({ ensureUploaded: async () => { throw Error('test inline transport') } }) })
  let body
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.match(String(url), /\/messages$/)
    body = JSON.parse(init.body)
    return new Response('', { status: 503 })
  })
  await assert.rejects(async () => {
    for await (const _ of adapter.stream({ model, provider: 'deepseek', messages: h.messages })) {}
  }, err => {
    if (!body) throw err.cause || err
    return true
  })
  const sent = body?.messages.flatMap(m => m.content).find(b => b.type === 'image')
  assert.equal(sent?.source.type, 'base64')
  const pixels = await sharp(Buffer.from(sent.source.data,'base64')).removeAlpha().raw().toBuffer()
  assert.ok(pixels[0] > 220 && pixels[1] < 30 && pixels[2] < 30)
})

test('bad source, bad image or excessive count yields QQ error and zero model calls', async () => {
  for (const input of [['file:///blocked-image.png'], ['http://127.0.0.1/private'], ['https://gchat.qpic.cn.example.org/x'],
    ['base64://AA=='], ['base64://%%%'], [source, source, source, source, source]]) {
    const h = harness()
    await h.post(input.map(image)); await Promise.all(h.jobs)
    assert.equal(h.messages.length, 0)
    assert.match(h.errors[0], /图片未提交给模型/)
  }
  await assert.rejects(loadImages(['base64://' + Buffer.alloc(1048577).toString('base64')], store, root, 1), /大小限制/)
})

test('text-only delivery still works', async () => {
  const h = harness()
  await h.post([text('hello')]); await Promise.all(h.jobs)
  assert.deepEqual(h.messages[0].content.map(p => p.type), ['text'])
  assert.match(h.messages[0].content[0].text, /hello$/)
})

test('addressed group messages preserve sender and image position', async () => {
  const h = harness(createInbound, { groupMode: 'open', requireMention: true })
  await h.post([{ type:'at', data:{qq:'13'} }, text('before'), image(), text('after')],
    { message_type:'group', group_id:45 })
  await Promise.all(h.jobs)
  const blocks = h.messages[0].content
  assert.match(blocks[0].text, /before$/)
  assert.equal(blocks[1].type, 'image')
  assert.match(blocks[2].text, /^after/)
})

test('trusted CDN enforces streaming cap and forbids redirects', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.hostname, 'gchat.qpic.cn')
    assert.equal(options.redirect, 'error')
    return new Response(new Uint8Array(1048577))
  })
  await assert.rejects(loadImages(['https://gchat.qpic.cn/test'], store, root, 1), /大小限制/)
})

test('sleep queue replays ordered image blocks into the morning turn', async () => {
  const jobs = [], messages = []
  const record = { sessionId:'test', busy:0, agent:{ followup:m => messages.push(m) } }
  const sleep = createSleep({ config:{holdNightMessages:true}, getAttachments:()=>store, logger:{},
    manager:{list:()=>[record], enqueue:(_,job)=>jobs.push(job())} })
  const [block] = await loadImages([source],store,root,1)
  sleep.start()
  try {
    sleep.hold(record,'A[图片]B',new Date(2025,1,1,3),[{type:'text',text:'A'},block,{type:'text',text:'B'}])
    sleep.tick(new Date(2025,1,1,10))
    await Promise.all(jobs)
    assert.deepEqual(messages[0].content.slice(-3).map(p=>p.type),['text','image','text'])
  } finally { sleep.stop() }
})
