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
  // Klassement is the home page; /klassement keeps the menu label and URL in
  // sync for anyone typing or sharing the link.
  redirects: { '/klassement': '/' },
});
