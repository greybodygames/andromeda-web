import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    allowedHosts: ['local-test.greybodygames.com'],
  },
})
