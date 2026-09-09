import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves from /<repo-name>/ in production.
// VITE_BASE_URL is set by the deploy workflow; defaults to '/' for local dev.
export default defineConfig({
  base: process.env.VITE_BASE_URL ?? '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
})
