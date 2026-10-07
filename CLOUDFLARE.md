# Moving Coursemate to Cloudflare Workers

Everything here happens on a separate git branch. Your Vercel deployment is untouched until you decide to switch the domain.

## 1. Create the branch
```
git checkout main
git pull
git checkout -b cloudflare-hosting
```
(`git checkout -b NAME` creates the branch and switches to it. `git branch` shows which branch you're on. `git checkout main` takes you back.)

## 2. Add the kit files to your project root
`open-next.config.ts`, `wrangler.jsonc`, `fix-params.mjs`, and `.dev.vars.example` from this zip.

## 3. Upgrade and install (run in the project root)
```
npm install next@15.5.27 react@19 react-dom@19
npm install -D @opennextjs/cloudflare wrangler
npm pkg set scripts.preview="opennextjs-cloudflare build && opennextjs-cloudflare preview"
npm pkg set scripts.deploy="opennextjs-cloudflare build && opennextjs-cloudflare deploy"
node fix-params.mjs
```
`fix-params.mjs` changes `const { id } = params;` to `const { id } = await params;` in the 7 pages that need it (Next 15 made `params` async). Check `git diff` afterwards.

## 4. Add to .gitignore
```
.open-next
.wrangler
.dev.vars
```

## 5. Test
- `npm run dev` works as before. Fix anything React 19 / Next 15 complains about first.
- `npm run preview` builds and runs the app on the real Workers runtime locally. Put server secrets in `.dev.vars` and the NEXT_PUBLIC_* values in `.env.local`. If this fails on Windows, use WSL, or skip it and test on the deployed workers.dev URL (Cloudflare builds on Linux).
- Checklist: sign up / log in / log out, a course page, the tutor rich-text editor page, push notifications, uploading/loading images, and a Paystack test payment end to end.

## 6. Deploy
Easiest: Cloudflare dashboard > Workers & Pages > create > import your GitHub repo, pick the `cloudflare-hosting` branch.
- Build command: `npx opennextjs-cloudflare build`
- Deploy command: `npx opennextjs-cloudflare deploy`
(Menu names change over time; if something doesn't match, search Cloudflare's docs for "Workers Builds".)
Or from your machine: `npx wrangler login`, then `npm run deploy`.

## 7. Environment variables
Build-time (inlined into the browser code, so they must exist when the build runs):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`

Runtime secrets (set as encrypted secrets, never as plain build variables):
`SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_WEBHOOK_SECRET`

Runtime variable: `PAYSTACK_ENABLED` (true / false)

## 8. Cutting over
1. Test on the workers.dev URL first. Update the Paystack test webhook URL to it.
2. Check the free-plan CPU limit holds on your heaviest pages (Cloudflare error 1102 means a request ran out of CPU time). If it does, the paid Workers plan is $5/month.
3. Only when everything passes: point your domain at Cloudflare, set NEXT_PUBLIC_SITE_URL to the real domain, update Supabase auth redirect URLs and the Paystack webhook URL, then retire Vercel.
4. Keep Vercel running until you're sure. Rolling back is just switching the domain back.
