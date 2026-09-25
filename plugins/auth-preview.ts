import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const pages = {
  '/auth/sign-in': 'sign_in.html',
  '/auth/error': 'error.html',
} as const
const outputDirectory = fileURLToPath(new URL('../auth/dist/', import.meta.url))

async function loadTemplate(page: string): Promise<string> {
  const [source, css, displayFont] = await Promise.all([
    readFile(fileURLToPath(new URL(`../auth/templates/${page}`, import.meta.url)), 'utf8'),
    readFile(fileURLToPath(new URL('../auth/style.css', import.meta.url)), 'utf8'),
    readFile(fileURLToPath(new URL('../src/assets/fonts/greybody-display.woff', import.meta.url))),
  ])
  if (!source.includes('__AUTH_CSS__')) throw new Error(`${page} is missing the shared CSS placeholder`)
  return source.replace(
    '__AUTH_CSS__',
    css.replace('__GREYBODY_DISPLAY_FONT_DATA__', displayFont.toString('base64')).trim(),
  )
}

export function authPreview(): Plugin {
  return {
    name: 'auth-preview',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname
        const page = pages[path as keyof typeof pages]
        if (!page) return next()

        try {
          const html = (await loadTemplate(page))
            .replace(/^{{define "[^"]+"}}\s*/, '')
            .replace(/\s*{{end}}\s*$/, '')
            .replaceAll('__AUTH_BASE_URL__', '#preview')
            .replaceAll('{{.ProxyPrefix}}', '/oauth2')
            .replaceAll('{{.Redirect}}', '/docs')
            .replaceAll('{{.StatusCode}}', '403')
            .replaceAll('{{.Title}}', 'Access denied')
            .replaceAll('{{.RequestID}}', 'preview-request')
            .replaceAll('{{if .RequestID}}', '')
            .replaceAll('{{if .Redirect}}', '')
            .replaceAll('{{end}}', '')

          response.setHeader('Content-Type', 'text/html; charset=utf-8')
          response.setHeader('Cache-Control', 'no-store')
          response.end(html)
        } catch (error) {
          next(error)
        }
      })
    },
    async writeBundle() {
      await mkdir(outputDirectory, { recursive: true })
      for (const page of Object.values(pages)) {
        await writeFile(fileURLToPath(new URL(`../auth/dist/${page}`, import.meta.url)), await loadTemplate(page))
      }
    },
  }
}
