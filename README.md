# Manu — AI Manufacturing Operations Agent

Manu turns a manufacturing outcome into auditable actions across PLAN, SOURCE,
MAKE, and DELIVER. The hero scenario secures a packaging shortage, pauses for
approval, receives materials, completes production, and allocates Friday orders.

## Quick start

1. Copy `.env.example` to `.env` and set `AUTH_SECRET`.
2. Start PostgreSQL with `docker compose up -d postgres`.
3. Run `npm install`, `npm run db:generate`, and `npx prisma migrate dev`.
4. Seed with `npm run db:seed` and start with `npm run dev`.
5. Sign in with `admin@demo.co.tz` / `Demo123!`.

`SMS_PROVIDER=simulator` runs the complete demo without sending live messages.
Set it to `africas-talking` and supply the Africa's Talking variables for real
SMS. Issued purchase orders remain incoming until a receipt is recorded.

## Run operations by SMS

Register each staff member's phone on `User.phone` (the demo seed reads
`DEMO_ADMIN_PHONE`, `DEMO_OPERATOR_PHONE`, and `DEMO_APPROVER_PHONE`). Point the
Africa's Talking inbound callback to `/api/webhooks/africas-talking/sms`.

For a callback that survives restarts, create a Cloudflare named tunnel whose
public hostname routes to `http://app:3000`, set `CLOUDFLARE_TUNNEL_TOKEN` and
`PUBLIC_WEBHOOK_BASE_URL`, then run `docker compose --profile stable-tunnel up`.
The Configuration page displays the exact callback URL and warns when a temporary
quick-tunnel hostname is still in use.

Factory users can operate the hero flow without opening the web app:

- Send a natural-language objective, such as `Make sure we're ready to fulfil all orders due Friday`.
- Send `STATUS` for the latest active objective.
- An approver sends `APPROVE RFQ-104` or `REJECT RFQ-104`.
- An operator sends `RECEIVED PO-204` when materials arrive.
- An operator sends `JOB PJ-301 FINISHED, PRODUCED 4000` after production.
- Send `HELP` for the command summary.

Supplier phone numbers continue to route to natural-language quotation extraction.
Every sender is matched to a tenant and role before a command can change state.
In demo mode, an administrator can restore the exact Friday hero baseline from
Configuration without reseeding users or master data.

## Services

- The Next.js app owns HTTP APIs, authentication, and the operator experience.
- The worker runs durable objective cycles and outbound communication jobs.
- PostgreSQL is the source of truth for operational and audit state.

All operational writes are performed by deterministic domain tools. Model output
can select tools and parse language, but cannot directly alter operational data.
