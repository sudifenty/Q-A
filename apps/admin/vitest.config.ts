import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/* Component tests: `npm run test:ui`.
   The parser suite stays on node's own runner (`npm test`) because it uses
   node:test — mixing the two runners in one process would silently skip tests.
   jsdom here because the picker is click-driven and that is what needs proving. */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
    /* the question banks are 1.7 MB + 684 KB of JSON; loading both in one run
       starved the default 5 s and made a good test fail at random */
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['./src/test/setup.ts']
  }
});
