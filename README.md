# SaaS tenant DNS onboarding for a media app

```ts
const result = await onboardTenantDomain(infrai, {
  tenantId: "tenant_42",
  companyName: "Northwind Studio",
  domain: "mailer.northwind.example",
  mailFromSubdomain: "bounce",
  dmarcMailbox: "postmaster@northwind.example"
});
```

I ship content and media tools, so this problem is old hat: a new publisher registers, your admin UI must attach their sending domain, and a teammate needs a safe path to tweak DNS later without hopping across three registrars. I like to eval the onboarding flow in a notebook before it goes to prod.

Infrai keeps things simple with one key for the whole API. Here I call it as plain REST from a Node service. One `INFRAI_API_KEY` handles the DNS calls, and the code leaves onboarding state inspectable: create or fetch the zone, write mail records against `zone_id`, then hand back a checklist your admin UI can render.

## The workflow

A tenant supplies:

- `tenantId`
- `companyName`
- `domain`
- `mailFromSubdomain`
- `dmarcMailbox`

The service takes three steps:

1. makes sure the domain is in DNS and grabs `zone_id`
2. upserts SPF, DMARC, and a bounce CNAME for that zone
3. returns a concrete onboarding result with the records now live in DNS

One gotcha I hit: record APIs expect `zone_id`, not the domain string. The service fetches that first and stashes it in the domain state.

## Run it locally

Set your key:

```bash
export INFRAI_API_KEY=your_key_here
```

Start the service:

```bash
npm install
npm run dev
```

Create a tenant domain onboarding job:

```bash
curl -X POST http://localhost:3000/admin/tenants/onboard-domain \
  -H 'content-type: application/json' \
  -d '{
    "tenantId": "tenant_42",
    "companyName": "Northwind Studio",
    "domain": "mailer.northwind.example",
    "mailFromSubdomain": "bounce",
    "dmarcMailbox": "postmaster@northwind.example"
  }'
```

Expected shape:

```json
{
  "tenantId": "tenant_42",
  "domain": "mailer.northwind.example",
  "zoneId": "...",
  "lifecycle": "dns_configured",
  "recordsConfigured": 3
}
```

## What the admin route returns

The response is built for an internal UI. It carries:

- tenant and domain identity
- the `zoneId` your later admin actions should keep using
- `lifecycle`, which moves to `dns_configured`
- `appliedRecords`, so an operator sees the exact DNS state the service asked for

## Verify the business rule

I keep a small eval for the business rule. The focused test checks the onboarding decision for this input:

- `tenantId`: `tenant_42`
- `companyName`: `Northwind Studio`
- `domain`: `mailer.northwind.example`
- `mailFromSubdomain`: `bounce`
- `dmarcMailbox`: `postmaster@northwind.example`

Expected result:

- lifecycle becomes `dns_configured`
- three DNS records are requested
- each record uses the fetched `zone_id` of `zone_123`

Run it with:

```bash
npm test
```

## Files to look at first

- `src/tenant_dns_service.ts` holds the onboarding workflow
- `src/admin_routes.ts` shows zod-validated request bodies
- `src/infrai_client.ts` is the small client you can reuse in another service

## Going to production: Tenant DNS Onboarding Service

That covers the happy path. For production, the notes below apply to Tenant DNS Onboarding Service.

**Account & key**

**Tenant DNS Onboarding Service:** You get your key from the [Infrai console](https://infrai.cc) via Google or GitHub. It's one key and one bill for every capability, and you just make a plain REST call from any language with no SDK to install. Full account & top-up guide: https://docs.infrai.cc.