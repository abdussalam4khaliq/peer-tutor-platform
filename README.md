# Peer Tutor Platform — Phase 0 Setup

This is the starter project. Follow these steps in order.

## 1. Install Node.js
Download and install the **LTS version** from https://nodejs.org if you don't have it already.
Check it worked by opening a terminal and running:
```
node -v
```

## 2. Unzip this project
Unzip the folder somewhere on your computer, e.g. `Documents/peer-tutor-platform`.

## 3. Install dependencies
Open a terminal **inside the project folder** and run:
```
npm install
```

## 4. Run it locally
```
npm run dev
```
Open http://localhost:3000 — you should see "Peer Tutor Platform 🎓" with a red ❌ next to
Supabase (that's expected, we haven't connected it yet).

## 5. Create a GitHub repo
1. Go to https://github.com/new
2. Name it e.g. `peer-tutor-platform`, keep it **Private**, don't add a README (we already have one).
3. Follow GitHub's instructions under "…or push an existing repository from the command line", run those commands inside the project folder.

## 6. Create a Supabase project
1. Go to https://supabase.com, sign up/log in, click **New Project**.
2. Pick a name and a strong database password (save it somewhere safe).
3. Once it's created, go to **Project Settings > API**.
4. Copy the **Project URL** and the **anon public key**.

## 7. Connect Supabase locally
1. In the project folder, copy `.env.local.example` to a new file called `.env.local`.
2. Paste in the URL and anon key you copied above.
3. Restart `npm run dev` — refresh http://localhost:3000 and the Supabase line should now show ✅.

## 8. Deploy to Vercel
1. Go to https://vercel.com and sign up using your **GitHub account**.
2. Click **Add New > Project**, select your `peer-tutor-platform` repo.
3. Before deploying, expand **Environment Variables** and add the same two values from `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click **Deploy**. Vercel gives you a live `.vercel.app` URL when it's done.

## ✅ Phase 0 is done when:
- You have a live Vercel URL showing the ✅ Supabase line.
- Your code is pushed to a private GitHub repo.

Come back to Claude once this is working, and we'll move to Phase 1 (sign-up/login with roles).
