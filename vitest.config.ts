import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Tests never depend on the machine's time zone or language: 0.0.2 writes local times into snapshot
// descriptions, and the frozen fixtures hold them. Set here, before Vitest starts its worker
// processes, so every worker inherits them from the start (the default locale is read once, at
// process start), and again through `env` for any worker that does not inherit this environment.
const PINNED = { TZ: 'UTC', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
// The root has no Node types (as in the tests), so the one Node global used here is typed locally.
const { env } = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process;
Object.assign(env, PINNED);

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['test/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
      setupFiles: ['test/setup.ts'],
      env: PINNED,
    },
  })
);
