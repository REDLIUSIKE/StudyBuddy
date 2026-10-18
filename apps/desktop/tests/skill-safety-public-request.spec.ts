import { describe, expect, it } from 'vitest'
import { isPublicSkillSourceAddress, requestSkillSafetyPublic } from '../src/studybuddy/skill-safety-public-request.ts'
describe('skill source public transport', () => {
  it('public_routes_exclude_private_reserved_and_mapped_addresses', () => {
    for (const [address, allowed] of [
      ['140.82.112.6', true], ['2606:50c0:8000::154', true], ['8.8.8.8', true],
      ['127.0.0.1', false], ['10.1.2.3', false], ['172.20.1.1', false], ['192.168.0.1', false],
      ['169.254.169.254', false], ['100.64.1.1', false], ['198.18.0.1', false], ['0.0.0.0', false], ['224.0.0.1', false],
      ['::1', false], ['fc00::1', false], ['fe80::1', false], ['::ffff:127.0.0.1', false], ['2001:db8::1', false], ['2002:7f00:1::', false],
    ] as const) expect(isPublicSkillSourceAddress(address), address).toBe(allowed)
  })
  it('only_fixed_https_hosts_without_credentials_or_ports_are_contactable', async () => {
    const signal = new AbortController().signal
    for (const url of ['http://api.github.com/repos/a/b', 'https://api.github.com:444/repos/a/b', 'https://user:secret@api.github.com/repos/a/b', 'https://localhost/private', 'https://127.0.0.1/private', 'https://evil.test/private']) {
      await expect(requestSkillSafetyPublic(new URL(url), signal, 1024)).rejects.toMatchObject({ code: 'SKILL_SAFETY_SOURCE_UNSAFE' })
    }
  })
})
