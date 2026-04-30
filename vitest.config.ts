import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['lib/**', 'hooks/**', 'app/api/**'],
      exclude: [
        'lib/types/**',
        'lib/supabase-browser.ts',
        'lib/supabase-server.ts',
        // Boundary/context files: always mocked in unit tests, require integration tests
        'lib/database.ts',
        'lib/auth-context.tsx',
        'lib/filter-context.tsx',
        // Large AI routes: require external API mocking, covered by integration tests
        'app/api/ai/insights/**',
        'app/api/ai/speech/**',
        'app/api/ai/vision/**',
      ],
      thresholds: { lines: 60 },
    },
  },
})
