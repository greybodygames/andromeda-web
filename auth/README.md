# OAuth2 Proxy pages

`templates/sign_in.html`, `templates/error.html`, and `style.css` are the authoritative sources. The templates retain OAuth2 Proxy's Go-template fields and the chart's `__AUTH_BASE_URL__` replacement token. `npm run build` inlines the shared CSS into both HTML files in the ignored `auth/dist/` directory; the chart copies begin with a generated-file warning.

To view the pages locally, run `npm run dev` and open `/auth/sign-in` or `/auth/error` on the Vite server. These development-only routes render the authoritative templates with sample values for layout review and do not perform authentication. They are absent from the production build.

The pages load Chakra Petch and the GreyBody logo from `greybodygames.com`. Both Chakra font URLs returned HTTP 200 with `Access-Control-Allow-Origin: *` on 2026-09-25. The auth preview/build plugin reads `src/assets/fonts/greybody-display.woff` and embeds GreyBody Display into both HTML pages, so the wordmark does not wait for a font request. The Andromeda homepage also uses Vite's built-in inlining for this small font.

The sync workflow runs when an auth source or its Vite plugin changes on `main` and checks for chart drift daily. It builds the pages, copies the generated output, and retries non-force pushes if chart `main` moves concurrently. Configure `GITOPS_APP_CLIENT_ID` and `GITOPS_APP_PRIVATE_KEY` on the `gitops-template-sync` GitHub Environment, restricted to protected `main`, before pushing this workflow. Those settings were absent from `greybodygames/andromeda-web` when checked on 2026-09-25.
