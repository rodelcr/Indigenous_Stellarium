import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
// `base` is the path the app will be served from. It stays '/' for local
// dev and for any deployment at a domain root; deploy/pages.sh sets
// PAGES_BASE='/<repo>/' because GitHub Pages serves project sites from a
// subpath. Every asset reference in src/ goes through assetUrl(), which
// reads this value back as import.meta.env.BASE_URL — see src/assetUrl.js.
const base = process.env.PAGES_BASE || '/'

// `publicDir` is overridable so deploy/pages.sh can build from a FILTERED
// copy of web/public rather than the real one. The real directory holds
// every fetched sky culture including the ones no public deployment may
// redistribute (deploy/exclusions.json); building straight from it would
// copy them into dist/ no matter what the rest of the pipeline does.
const publicDir = process.env.PAGES_PUBLIC_DIR || 'public'

export default defineConfig({
  base,
  publicDir,
  plugins: [vue()],
  server: {
    proxy: {
      // Task 7: draft persistence backend (FastAPI on :8000). Proxying
      // avoids CORS during dev; production deploy is a separate concern.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
