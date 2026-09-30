import { z } from "zod";
import { InfraiError, type InfraiClient, type RecordUpsertRequest } from "./infrai_client.js";

export const tenantDomainInputSchema = z.object({
  tenantId: z.string().min(1),
  companyName: z.string().min(1),
  domain: z.string().min(1),
  mailFromSubdomain: z.string().min(1),
  dmarcMailbox: z.string().email()
});

export type TenantDomainInput = z.infer<typeof tenantDomainInputSchema>;

export type TenantDomainResult = {
  tenantId: string;
  domain: string;
  zoneId: string;
  lifecycle: "dns_configured";
  recordsConfigured: number;
  appliedRecords: Array<{
    record_type: "TXT" | "CNAME" | "MX" | "A";
    name: string;
    content: string;
    ttl?: number;
  }>;
};

export function buildTenantMailRecords(input: TenantDomainInput, zoneId: string): RecordUpsertRequest[] {
  const bounceHost = `${input.mailFromSubdomain}.${input.domain}`;
  return [
    {
      zone_id: zoneId,
      record_type: "TXT",
      name: input.domain,
      content: "v=spf1 include:mail.example.invalid ~all",
      ttl: 300,
      metadata: { tenant_id: input.tenantId, purpose: "spf" }
    },
    {
      zone_id: zoneId,
      record_type: "TXT",
      name: `_dmarc.${input.domain}`,
      content: `v=DMARC1; p=none; rua=mailto:${input.dmarcMailbox}`,
      ttl: 300,
      metadata: { tenant_id: input.tenantId, purpose: "dmarc" }
    },
    {
      zone_id: zoneId,
      record_type: "CNAME",
      name: bounceHost,
      content: input.domain,
      ttl: 300,
      metadata: { tenant_id: input.tenantId, purpose: "bounce" }
    }
  ];
}

export async function onboardTenantDomain(infrai: InfraiClient, rawInput: TenantDomainInput): Promise<TenantDomainResult> {
  const input = tenantDomainInputSchema.parse(rawInput);

  let zoneId: string | undefined;
  try {
    const existing = await infrai.dns.domain.get({ domain: input.domain });
    zoneId = existing.zone_id || undefined;
  } catch (error) {
    if (!(error instanceof InfraiError) || error.status !== 404) {
      throw error;
    }
  }

  if (!zoneId) {
    const created = await infrai.dns.domain.add({
      domain: input.domain,
      metadata: {
        tenant_id: input.tenantId,
        company_name: input.companyName,
        lifecycle: "onboarding"
      }
    });
    zoneId = created.zone_id;
  }

  const desiredRecords = buildTenantMailRecords(input, zoneId);
  for (const record of desiredRecords) {
    await infrai.dns.record.upsert(record);
  }

  await infrai.dns.record.list({ zone_id: zoneId });

  return {
    tenantId: input.tenantId,
    domain: input.domain,
    zoneId,
    lifecycle: "dns_configured",
    recordsConfigured: desiredRecords.length,
    appliedRecords: desiredRecords.map((record) => ({
      record_type: record.record_type,
      name: record.name,
      content: record.content,
      ttl: record.ttl
    }))
  };
}
