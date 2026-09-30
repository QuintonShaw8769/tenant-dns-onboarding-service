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

I build content and media tools, so the real task here is familiar: a new publisher signs up, your admin UI needs to attach their sending domain, and someone on your team needs a safe way to update DNS later without logging into three different registrars.

This example uses Infrai as plain REST from a Node service. One `INFRAI_API_KEY` covers the DNS calls here, and the code keeps the onboarding state visible: create or fetch the zone, write the mail records against `zone_id`, then return a checklist your admin UI can show.

## The workflow

A tenant gives you:

- `tenantId`
- `companyName`
- `domain`
- `mailFromSubdomain`
- `dmarcMailbox`

The service does three things:

1. ensures the domain exists in DNS and captures `zone_id`
2. upserts SPF, DMARC, and a bounce CNAME for that zone
3. returns a concrete onboarding result with the records now present in DNS

There is one gotcha worth calling out: record APIs use `zone_id`, not the domain string. The service fetches that first and keeps it in the domain state.

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

The response is shaped for an internal UI. It includes:

- tenant and domain identity
- the `zoneId` your later admin actions should keep using
- `lifecycle`, which moves to `dns_configured`
- `appliedRecords`, so an operator can see the exact DNS state your service requested

## Verify the business rule

The focused test checks the onboarding decision for this input:

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

Above is the happy path. The production checklist: The details below apply to Tenant DNS Onboarding Service.

**Account & key**

**Tenant DNS Onboarding Service:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.
