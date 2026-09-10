import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Nothing sets VITE_BASE_URL any more — the app is run locally and the Pages
// deploy is gone (docs/v2-plan.md sec 9). Kept as a hook in case it is ever
// served from a subpath, which is the only case '/' would be wrong for.
export default defineConfig({
  base: process.env.VITE_BASE_URL ?? '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
})
