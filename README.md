# QuickLink Personal — GitHub + Cloudflare

A personal URL shortener with edge redirects, a private dashboard, and click analytics.

## What it includes
- Fast redirects through Cloudflare Workers
- Random short aliases and optional custom aliases
- Private dashboard protected by an admin password
- Click totals, daily activity, country, device, browser, referrer and recent-click data
- Link deletion through the API (dashboard UI can be extended)
- D1 database persistence

> Important: GitHub is used to store and deploy the code. GitHub Pages alone cannot run the backend or store live click analytics. This project uses Cloudflare Workers + D1 for those parts.

## 1. Create the Cloudflare resources
1. Create/sign in to a Cloudflare account.
2. Open **Workers & Pages** and create a Worker project named `quicklink-personal`.
3. In **Storage & databases → D1**, create a database named `quicklink-db`.
4. Copy the D1 database ID into `wrangler.toml`, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.
5. In the D1 database console, run the complete contents of `schema.sql`.

## 2. Add the admin password
In the Worker settings, open **Settings → Variables and Secrets**.
Add a secret named `ADMIN_PASSWORD` with a strong, unique password. Do not put the password in GitHub or in source code.

## 3. Deploy from GitHub
1. Create a new GitHub repository and upload all files in this project.
2. In Cloudflare, connect the Worker to that GitHub repository using **Workers Builds / Git integration**.
3. Set the build/deploy command to `npx wrangler deploy`.
4. Ensure the project root is the repository root. Cloudflare will use `wrangler.toml`.
5. Deploy. Your site will be available at the `*.workers.dev` address Cloudflare provides.
6. Open the URL, enter your `ADMIN_PASSWORD`, and start shortening links.

If the Git integration screen asks for a build command, use:
```bash
npx wrangler deploy
```
No separate build step is required.

## 4. Custom domain (optional)
In the Worker settings, add a custom domain such as `go.yourdomain.com`. Your short links will then use that domain.

## 5. Local deployment with Wrangler (alternative)
Install Node.js, then:
```bash
npm install -g wrangler
wrangler login
wrangler d1 execute quicklink-db --remote --file=./schema.sql
wrangler secret put ADMIN_PASSWORD
wrangler deploy
```
The `wrangler.toml` D1 database ID must already be filled in.

## Notes about tracking and accuracy
- Each request to an active short link is logged once by the Worker. The redirect is returned immediately while the D1 write runs in the request lifetime.
- Automated bots, link previewers, security scanners, and browser prefetching can also create requests. Therefore clicks are request counts, not guaranteed unique human visitors.
- Country is based on Cloudflare's request country metadata. Referrer can be missing or suppressed by browser privacy settings.
- The dashboard refreshes every 30 seconds. Click events are recorded as they arrive; the dashboard is not a websocket stream.
- Use HTTPS. Do not share your admin password. This starter is intended for personal use, not a public multi-tenant SaaS.
- Random aliases use a short alphabet and are checked for collisions; custom aliases must be unique.
