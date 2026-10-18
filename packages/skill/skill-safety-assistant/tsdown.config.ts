import { defineConfig } from 'tsdown'
/** Build only declared native entries; the scanner and its large dependencies are never included. */
export default defineConfig(['index', 'provider', 'tools', 'skills', 'wire'].map(name => ({
  entry: ['lib/types/' + name + '.js'], outDir: 'lib', format: ['esm'] as const,
  platform: 'node', target: 'es2024', fixedExtension: false, dts: false, clean: false,
  // Consume emitted dependencies; source aliases can preserve decorators in the Node bundle.
  tsconfig: false,
  // tsdown 0.22 normalizes false to undefined before calling Rolldown; keep it explicit there.
  inputOptions: { tsconfig: false },
})))
