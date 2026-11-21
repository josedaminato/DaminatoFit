import { defineConfig } from 'tsup';

// Single self-contained bundle so the runtime image needs no node_modules.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/.*/],
});
