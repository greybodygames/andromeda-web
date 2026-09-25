# Andromeda Documentation Router

This Cloudflare Worker keeps the public Andromeda website on GitHub Pages while routing the canonical documentation paths to the Kubernetes-hosted static documentation origin.

```text
andromeda.greybodygames.com/
  -> GitHub Pages

andromeda.greybodygames.com/docs and /docs/*
  -> this Worker
  -> Workers VPC Service (hetzner-fsn1-dc4-prod-traefik)
  -> Cloudflare Tunnel
  -> private Traefik entrypoint
  -> OAuth2 Proxy ForwardAuth
  -> Kubernetes
```

## Configuration

`wrangler.jsonc` is the source of truth for the Worker name, route, public hostname, path prefix, central sign-in URL, VPC Service binding, and disabled `workers.dev` and preview endpoints. None of these values is secret.

Cloudflare must also be configured with:

- VPC Service `hetzner-fsn1-dc4-prod-traefik` with ID
  `01a0d3ad-c157-7782-93ef-bd8b713b8c57`, targeting
  `traefik-cloudflare.traefik.svc.cluster.local` over HTTP port `80` through
  the KFlared-managed Andromeda tunnel.
- No Cloudflare Access application on `/docs`; Traefik and OAuth2 Proxy own
  the human authentication flow. During migration, keep the existing Access
  application until the VPC-backed Worker deployment has been verified.

No service token, Worker secret, or GitHub Actions secret is required.

## Authentication navigation

Traefik ForwardAuth returns `401` for a missing or invalid OAuth2 Proxy session.
For ordinary documentation requests, the Worker converts that response into a
`302` navigation to `https://auth.greybodygames.com/oauth2/sign_in`, with the
complete original public URL in the `rd` query parameter. The browser therefore
shows the central sign-in hostname before continuing through Microsoft Entra and
returning to the original documentation URL.

The Worker deliberately does not redirect the background access-check probe or
genuine `403` responses. The probe must remain non-interactive, and repeating
the login flow cannot resolve an authorization denial.

## Authenticated access check

`GET` and `HEAD` requests to `/docs/.access-check` make a `HEAD /docs` request
through the VPC Service. They return `204 No Content` with
`Cache-Control: no-store` only when Traefik's ForwardAuth middleware admits
the OAuth2 Proxy session and the documentation backend returns `200`. The
endpoint does not expose identity data.

The public website uses this endpoint to decide whether to reveal its
otherwise-hidden documentation link. Its response must never be cached.

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
- A signed-out `/docs` or `/docs/*` navigation redirects to the central OAuth2 Proxy sign-in page, and a successful login returns to the complete original URL.
- Authenticated `/docs` and `/docs/*` requests reach the documentation site through Workers VPC.
- An OAuth2-authenticated `GET` or `HEAD` request to `/docs/.access-check` returns `204` with `Cache-Control: no-store`; a signed-out request returns the authentication failure status and keeps the link hidden.
- A genuine `403` remains an authorization failure and does not start another login flow.
- `/docs-example` passes through to GitHub Pages.
- The Kubernetes origin has no public hostname or Worker-bypass route.
- Documentation navigation, Next assets, search, API graph assets, redirects, and query strings work through the canonical hostname.

To roll back the edge routing without changing either origin, disconnect or remove the Worker route.
