import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import path from 'node:path'

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, '../../migrations'))
  return {
    resolve: {
      alias: {
        '@shared': path.join(__dirname, '../../shared'),
      },
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: path.join(__dirname, '../../wrangler.jsonc') },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            APP_ENV: 'test',
            DEV_ADMIN_BYPASS: '0',
            ADMIN_API_TOKEN: 'test-admin-token-0123456789abcdef',
            SHOW_SYNTHETIC: '1',
          },
        },
      }),
    ],
    test: {
      name: 'worker',
      include: ['**/*.test.ts'],
      setupFiles: ['./apply-migrations.ts'],
    },
  }
})
