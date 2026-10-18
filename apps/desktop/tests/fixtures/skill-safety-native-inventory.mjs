import { appendFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs'
import { createInterface } from 'node:readline'

const [credentialFile, bootsFile, exitFile] = process.argv.slice(2)
let session
const send = value => process.stdout.write(JSON.stringify(value) + '\n')
createInterface({ input: process.stdin }).on('line', line => {
  const frame = JSON.parse(line)
  if (!session) {
    session = frame
    appendFileSync(bootsFile, JSON.stringify({ pid: process.pid, credential: session.accessToken }) + '\n')
    send({ schemaVersion: 1, ready: true, scope: session.scope })
    return
  }
  if (existsSync(exitFile)) {
    unlinkSync(exitFile)
    process.exit(0)
  }
  const accepted = frame.command === 'skill_safety_inventory' && frame.page === 'studybuddy-native://skill-safety'
  const current = readFileSync(credentialFile, 'utf8') === session.accessToken
  send({ schemaVersion: 1, requestId: frame.requestId, scope: session.scope,
    data: accepted && current ? { revision: 'fixture-revision', complete: true, instances: [
      { instanceId: 'fixture-instance', toolId: 'Claude Code', displayName: 'fixture-pdf', purpose: 'Read PDF documents', contentSha256: 'a'.repeat(64) },
    ] } : null,
    error: accepted && current ? null : { code: accepted ? 'SKILL_BRIDGE_EXPIRED' : 'SKILL_COMMAND_DENIED' },
  })
})
