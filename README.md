# Equity Investor Club website

Public website for Equity Investor Club, a financial-literacy community founded by Amrith Kishore M in 2023. Hosted on Cloudflare Workers.

- Learning pages, glossary, SIP/SWP calculators, risk quiz and NSE/BSE stock search.
- Articles are written in the CMS at `/cms` (sign in with a GitHub token). Saving a post commits it to `content/articles/`, and Cloudflare rebuilds the site in about a minute.

Build: `npm run build` (generates `dist/` and the articles feed). Deploy: `npx wrangler deploy`.
