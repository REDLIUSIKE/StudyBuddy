import { describe, expect, it } from 'vitest';

// Independent approved inventory, not computed from the registry under test.
const expectedIds = ['aider','antigravity','antigravitydesktop','chatgptdesktop','claude_code','claudedesktop','claudescience','cline','clinedesktop','codex','coffeecli','cursor','dsh','geminidesktop','grok','grokbot','hermes','kilo','kimicode','kimidesktop','manus','mimocode','mimodesktop','minimaxcode','minimaxdesktop','omp','openclaw','opencode','opencodedesktop','openscience','pi','qwencode','translator','vibe-trading','vscode','workbuddy','workbuddyai','zcode'];
const nonConfigIds = ['antigravity','antigravitydesktop','claudescience','coffeecli','cursor','geminidesktop','grokbot','manus','vscode'];
const modulePath = './native-tools';
const registry = await import(/* @vite-ignore */ modulePath).catch(() => null);

describe('native tool registry used by platform and desktop', () => {
  it('offers exactly the approved 38 identities and no game/network identities', () => {
    expect(registry?.NATIVE_TOOLS?.map((tool: { id: string }) => tool.id).sort()).toEqual([...expectedIds].sort());
  });
  it('rejects unknown/untrusted IDs without coercing them to a supported tool', () => {
    expect(registry).not.toBeNull();
    for (const id of ['claudecode','reversi','clashverge','../codex','__proto__',null,{},'']) {
      expect(() => registry.getNativeToolDefinition(id)).toThrow('unknown_tool');
    }
  });
  it('exposes no connectable protocols for the nine explicitly unmanaged model configurations', () => {
    expect(registry).not.toBeNull();
    expect(registry.NATIVE_TOOLS.filter((tool: { noModelConfig: boolean }) => tool.noModelConfig).map((tool: { id: string }) => tool.id).sort()).toEqual([...nonConfigIds].sort());
    for (const id of nonConfigIds) expect(registry.getNativeToolDefinition(id).protocols).toEqual([]);
  });
  it('uses shared native scopes for CLI/desktop without confusing their tool identities', () => {
    expect(registry).not.toBeNull();
    const pairs = [['codex','chatgptdesktop','codex-home'],['cline','clinedesktop','cline-home'],['kimicode','kimidesktop','kimi-home'],['minimaxcode','minimaxdesktop','minimax-home'],['opencode','opencodedesktop','opencode-home']];
    for (const [first,second,scope] of pairs) {
      expect(registry.getNativeToolDefinition(first).nativeConfigScope).toBe(scope);
      expect(registry.getNativeToolDefinition(second).nativeConfigScope).toBe(scope);
      expect(registry.getNativeToolDefinition(first).id).not.toBe(registry.getNativeToolDefinition(second).id);
    }
    expect(registry.getNativeToolDefinition('claude_code').upstreamId).toBe('claudecode');
  });
  it('distinguishes the embedded translator from native/unsupported launch targets', () => {
    expect(registry).not.toBeNull();
    expect(registry.getNativeToolDefinition('translator').platformSupport.windows).toBe('embedded');
    expect(registry.getNativeToolDefinition('geminidesktop').platformSupport.windows).toBe('unsupported');
    expect(registry.getNativeToolDefinition('codex').platformSupport.windows).toBe('native');
  });
  it('keeps OpenClaw management and the approved official partial-update protocols', () => {
    expect(registry).not.toBeNull();
    const openclaw = registry.getNativeToolDefinition('openclaw');
    expect(openclaw.noModelConfig).toBe(false);
    expect(openclaw.platformSupport.windows).toBe('native');
    expect(Object.getOwnPropertyDescriptor(openclaw, 'configurationRestriction')?.value).toBeNull();
    expect(openclaw.configurationEvidence).toBe('verified');
    expect(openclaw.protocols).toEqual(['openai_chat_completions','anthropic_messages']);
    for (const tool of registry.NATIVE_TOOLS.filter((tool: {id: string}) => tool.id !== 'openclaw')) {
      expect(Object.getOwnPropertyDescriptor(tool, 'configurationRestriction')?.value).toBeNull();
    }
  });
  it('binds original definitions and prevents a caller from mutating the catalog', () => {
    expect(registry).not.toBeNull();
    const codex = registry.getNativeToolDefinition('codex');
    expect(codex.protocols).toEqual(['openai_responses']);
    expect(codex.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() => { codex.nativeConfigScope = 'attacker-home'; }).toThrow();
    expect(() => { codex.protocols.push('openai_chat_completions'); }).toThrow();
  });
});
