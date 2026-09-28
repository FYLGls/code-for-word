/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  // Electron / local: relative paths. GitHub Pages project site needs the repo base.
  base: process.env.GITHUB_PAGES === '1' ? '/code-for-word/' : './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.js']
  }
})
