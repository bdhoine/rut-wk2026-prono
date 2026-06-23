// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import netlify from '@astrojs/netlify';

// Astro + React islands, Tailwind v4 (via PostCSS — see postcss.config.mjs),
// Netlify deploy. Pages are prerendered (static) by default.
export default defineConfig({
  site: 'https://rut-wk2026-prono.netlify.app',
  adapter: netlify(),
  integrations: [react()],
  vite: {
    build: {
      rollupOptions: {
        output: {
          // Keep React core, react-dom and scheduler in ONE vendor chunk.
          // Otherwise react-dom (which SETS React's internal hooks dispatcher,
          // `ReactSharedInternals.H`) and React core (which READS it for every
          // hook) live in separate chunks linked only by URL. A deploy/cache
          // skew that mixes chunk instances then leaves an island's first
          // useState reading a null dispatcher → "null is not an object
          // (evaluating 'f.H.useState')". Co-locating them makes set+read atomic.
          manualChunks(id) {
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
              return 'react-vendor';
            }
          },
        },
      },
    },
  },
});
