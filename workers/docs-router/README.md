# Andromeda Documentation Router

This Cloudflare Worker keeps the public Andromeda website on GitHub Pages while routing the canonical documentation paths to the Kubernetes-hosted static documentation origin.

```text
andromeda.greybodygames.com/
  -> GitHub Pages

andromeda.greybodygames.com/docs and /docs/*
  -> this Worker
  -> andromeda-docs.greybodygames.com
  -> Cloudflare Tunnel
  -> Kubernetes
```

## Configuration

`wrangler.jsonc` is the source of truth for the Worker name, route, public hostname, documentation origin, path prefix, and disabled `workers.dev` and preview endpoints. None of these values is secret.

Cloudflare must also be configured with:

- A WAF custom rule named `Only same-zone Workers may access Andromeda docs origin`, with action `Block` and expression:

  ```text
  (http.host eq "andromeda-docs.greybodygames.com" and cf.worker.upstream_zone ne "greybodygames.com")
  ```

  This blocks direct and cross-zone requests to the origin while allowing subrequests from Workers in the `greybodygames.com` zone.

- A human-facing Access application that protects both `andromeda.greybodygames.com/docs` and `andromeda.greybodygames.com/docs/*`. The Access policy runs before the Worker. Do not protect the entire canonical hostname because the GitHub Pages root remains public.

No service token, Worker secret, or GitHub Actions secret is required.

## Authenticated access check

`GET` and `HEAD` requests to `/docs/.access-check` return `204 No Content`
with `Cache-Control: no-store` after the canonical Access policy has admitted
the request. The Worker handles this endpoint before proxying to the
documentation origin and does not expose identity data.

The public website uses this endpoint to decide whether to reveal its
otherwise-hidden documentation link. It must remain inside the existing
`/docs` Access application; do not make it public or cache its response.

## Cloudflare Git integration

Connect the `andromeda-docs-router` Worker to the `greybodygames/andromeda-web` GitHub repository using Cloudflare Workers Builds:

- Production branch: `main`
- Root directory: `/`
- Build command: leave empty
- Deploy command: `npm run worker:deploy`
- Non-production branch builds: disabled
- Build watch include path: `workers/docs-router/*`

The Worker name in Cloudflare must remain `andromeda-docs-router` so it matches `wrangler.jsonc`.

Connecting the repository performs a production deployment. Do not connect it until the immutable documentation image exists in ACR and the GitOps deployment is healthy, because the committed Wrangler configuration includes the production `/docs*` route.

## Verification

Install the repository workspaces from the repository root and validate the Worker bundle without deploying it:

```bash
npm ci
npm run worker:check
```

After production deployment, verify:

- `/` still comes from GitHub Pages.
- `/docs` and `/docs/*` require the canonical Access policy and reach the documentation site.
- An authenticated `GET` or `HEAD` request to `/docs/.access-check` returns `204` with `Cache-Control: no-store`; the same request while signed out does not reach the Worker until Access authenticates it.
- `/docs-example` passes through to GitHub Pages.
- Direct requests to `andromeda-docs.greybodygames.com` remain blocked.
- Documentation navigation, Next assets, search, API graph assets, redirects, and query strings work through the canonical hostname.

To roll back the edge routing without changing either origin, disconnect or remove the Worker route.
