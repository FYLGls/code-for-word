/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.js']
  }
})
