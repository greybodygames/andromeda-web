import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { authPreview } from './plugins/auth-preview'

export default defineConfig({
  plugins: [tailwindcss(), authPreview()],
  server: {
    allowedHosts: ['local-test.greybodygames.com'],
    port: 5174,
  },
})
