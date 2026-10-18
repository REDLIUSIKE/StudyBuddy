import { it, expect } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

it('preserves long UTF-8 protocol frames through the Windows supervisor byte for byte', async () => {
  if (process.platform !== 'win32') return
  const { launchAigcProcess, terminateAigcProcess } = await import('../src/studybuddy/aigc-process.ts')
  const payload = { text: '结果包含 answer，多问题还包含 values；跳过整组时返回 skipped: true。🙂\n"'.repeat(1500) }
  const bytes = Buffer.from(JSON.stringify(payload) + '\n')
  const script = `require('node:readline').createInterface({input:process.stdin}).once('line',line=>{process.stdout.write(JSON.stringify(JSON.parse(line))+'\\n',()=>process.exit(0))})`
  const child = launchAigcProcess(process.execPath, ['-e', script], { cwd: process.cwd(), env: process.env })
  const output: Buffer[] = []
  child.stdout.on('data', chunk => { output.push(chunk) }); child.stderr.resume()
  try {
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once('exit', resolve); child.once('error', reject); child.stdin.on('error', reject)
    })
    child.stdin.write(bytes)
    expect(await exited).toBe(0)
    const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex')
    expect(digest(Buffer.concat(output))).toBe(digest(bytes))
  } finally { if (child.exitCode === null && child.signalCode === null) await terminateAigcProcess(child) }
}, 15000)

it('contains descendants when the owned service exits unexpectedly on Windows', async () => {
  const owner = await import('../src/studybuddy/aigc-process.ts').catch(() => null)
  expect(typeof owner?.launchAigcProcess).toBe('function')
  if (process.platform !== 'win32') return
  const directory = await mkdtemp(join(tmpdir(), 'aigc-process-'))
  const marker = join(directory, 'child.txt')
  const writer = `const fs=require('node:fs'); setInterval(()=>fs.appendFileSync(${JSON.stringify(marker)},'x'),25)`
  const root = `process.stdin.once('data',()=>{const {spawn}=require('node:child_process'); spawn(process.execPath,['-e',${JSON.stringify(writer)}],{stdio:'ignore'});setTimeout(()=>process.exit(1),600)})`
  try {
    const child = owner!.launchAigcProcess(process.execPath, ['-e', root], { cwd: directory, env: process.env })
    child.stdout.resume(); child.stderr.resume(); child.stdin.end('bootstrap\n')
    await new Promise<void>((accept, reject) => { child.once('exit', () => { accept() }); child.once('error', reject) })
    const before = await readFile(marker, 'utf8')
    await new Promise(accept => setTimeout(accept, 200))
    expect(await readFile(marker, 'utf8')).toBe(before)
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 15000)
