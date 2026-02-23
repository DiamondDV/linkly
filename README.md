<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f154ea61-8c61-410e-8a4d-f5f3f9b3bafe

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Initialize Supabase tables by running [`supabase/init.sql`](supabase/init.sql) in Supabase SQL Editor
4. Run the app:
   `npm run dev`

## Deploy (Render + Cloudflare)

1. Push this repo to GitHub.
2. In Render, create a **Web Service** from this repo (it will use `render.yaml`).
3. Set env vars in Render: `APP_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`.
4. After deploy, in Render add custom domain: `link.toolcloud.qzz.io`.
5. In Cloudflare DNS add:
   - `Type: CNAME`
   - `Name: link`
   - `Target: <your-render-service>.onrender.com`
   - `Proxy: DNS only` (or Proxied after TLS is confirmed)

For this subdomain setup, no `A` record is required.
