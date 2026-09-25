function errorResponse(message, status) {
  return new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}

function readConfiguration(env) {
  const publicHost = env.PUBLIC_HOST
  const pathPrefix = env.DOCS_PATH_PREFIX

  if (!publicHost || publicHost.includes('/') || publicHost.includes(':')) {
    throw new Error('PUBLIC_HOST must be a hostname')
  }

  if (!pathPrefix || pathPrefix === '/' || !pathPrefix.startsWith('/') || pathPrefix.endsWith('/')) {
    throw new Error('DOCS_PATH_PREFIX must be a non-root path without a trailing slash')
  }

  if (!env.TRAEFIK_ORIGIN || typeof env.TRAEFIK_ORIGIN.fetch !== 'function') {
    throw new Error('TRAEFIK_ORIGIN must be a VPC Service binding')
  }

  return { publicHost, pathPrefix }
}

function isDocumentationPath(pathname, pathPrefix) {
  return pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`)
}

function isAccessCheckPath(pathname, pathPrefix) {
  return pathname === `${pathPrefix}/.access-check`
}

export default {
  async fetch(request, env) {
    let configuration

    try {
      configuration = readConfiguration(env)
    } catch (error) {
      console.error('Invalid docs router configuration', error)
      return errorResponse('Worker configuration error', 500)
    }

    const publicUrl = new URL(request.url)
    const { publicHost, pathPrefix } = configuration

    // Reject workers.dev and preview URLs instead of exposing an alternate route
    // to the private documentation origin.
    if (publicUrl.hostname !== publicHost) {
      return errorResponse('Not Found', 404)
    }

    // The Cloudflare route uses /docs* so that /docs requests with query strings
    // are included. Pass similar-looking paths such as /docs-example through to
    // the normal GitHub Pages origin.
    if (!isDocumentationPath(publicUrl.pathname, pathPrefix)) {
      return fetch(request)
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: {
          Allow: 'GET, HEAD',
          'Cache-Control': 'no-store',
        },
      })
    }

    const isAccessCheck = isAccessCheckPath(publicUrl.pathname, pathPrefix)
    const upstreamUrl = new URL(publicUrl)
    upstreamUrl.protocol = 'http:'
    upstreamUrl.port = ''

    if (isAccessCheck) {
      // Probe a real documentation path so Traefik's ForwardAuth middleware
      // validates the OAuth2 Proxy session before the public site reveals its
      // otherwise-hidden documentation link.
      upstreamUrl.pathname = pathPrefix
      upstreamUrl.search = ''
    }

    const upstreamHeaders = new Headers()

    // Forward only representation and cache-validation headers needed by the
    // static site. A denylist could silently leak a future authentication
    // header across hostnames.
    for (const name of [
      'Accept',
      'Accept-Encoding',
      'Accept-Language',
      'Cache-Control',
      'Cookie',
      'If-Match',
      'If-Modified-Since',
      'If-None-Match',
      'If-Range',
      'If-Unmodified-Since',
      'Range',
    ]) {
      const value = request.headers.get(name)

      if (value !== null) {
        upstreamHeaders.set(name, value)
      }
    }

    upstreamHeaders.set('X-Forwarded-Host', publicHost)
    upstreamHeaders.set('X-Forwarded-Proto', 'https')

    const upstreamRequest = new Request(upstreamUrl, {
      method: isAccessCheck ? 'HEAD' : request.method,
      headers: upstreamHeaders,
      redirect: 'manual',
    })

    let upstreamResponse

    try {
      upstreamResponse = await env.TRAEFIK_ORIGIN.fetch(upstreamRequest)
    } catch (error) {
      console.error('Documentation VPC origin request failed', error)
      return errorResponse('Documentation origin unavailable', 502)
    }

    if (isAccessCheck) {
      return new Response(null, {
        status: upstreamResponse.status === 200 ? 204 : upstreamResponse.status,
        headers: {
          'Cache-Control': 'no-store',
        },
      })
    }

    const responseHeaders = new Headers(upstreamResponse.headers)
    const location = responseHeaders.get('Location')

    // The VPC Service fixes the network destination while this URL supplies
    // the Host header. Keep any origin-generated redirect on public HTTPS.
    if (location) {
      const redirectUrl = new URL(location, upstreamUrl)

      if (redirectUrl.hostname === publicHost) {
        redirectUrl.protocol = 'https:'
        redirectUrl.host = publicHost
        responseHeaders.set('Location', redirectUrl.toString())
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    })
  },
}
