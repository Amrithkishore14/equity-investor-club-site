# Equity Investor Club – Cloudflare showcase

The public site for Equity Investor Club, a financial-literacy community Amrith Kishore M founded in 2023.

Hosted on Cloudflare Workers (static assets + a small Worker):

- All learning pages, the glossary, SIP/SWP calculators, risk quiz and the NSE/BSE stock search (2,294 listed companies) work.
- Accounts, payments (Razorpay) and emails are switched off in this build, so it holds no secrets and no user data.
- The full Express + SQLite app (auth with bcrypt, sessions, admin dashboard, subscriptions) is at https://github.com/Amrithkishore14/equity.

Deploy: Cloudflare Workers Builds runs `npx wrangler deploy` on every push to `main`.
