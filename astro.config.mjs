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
});
