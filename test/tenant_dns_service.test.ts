import { describe, expect, it, vi } from "vitest";
import { onboardTenantDomain } from "../src/tenant_dns_service.js";
import { InfraiError, type InfraiClient } from "../src/infrai_client.js";

describe("onboardTenantDomain", () => {
  it.each([
    ["a 404 response", vi.fn().mockRejectedValue(new InfraiError(404, { message: "missing" }))],
    ["an empty zone id", vi.fn().mockResolvedValue({ zone_id: "" })]
  ])("creates the zone for %s, writes three records, and returns dns_configured", async (_case, get) => {
    const add = vi.fn().mockResolvedValue({ zone_id: "zone_123" });
    const upsert = vi.fn().mockResolvedValue({ record_id: "rec_1" });
    const list = vi.fn().mockResolvedValue([]);

    const infrai = {
      dns: {
        domain: { add, get },
        record: { upsert, list }
      }
    } as unknown as InfraiClient;

    const result = await onboardTenantDomain(infrai, {
      tenantId: "tenant_42",
      companyName: "Northwind Studio",
      domain: "mailer.northwind.example",
      mailFromSubdomain: "bounce",
      dmarcMailbox: "postmaster@northwind.example"
    });

    expect(add).toHaveBeenCalledWith({
      domain: "mailer.northwind.example",
      metadata: {
        tenant_id: "tenant_42",
        company_name: "Northwind Studio",
        lifecycle: "onboarding"
      }
    });

    expect(upsert).toHaveBeenCalledTimes(3);
    expect(upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      zone_id: "zone_123",
      record_type: "TXT",
      name: "mailer.northwind.example"
    }));
    expect(upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      zone_id: "zone_123",
      record_type: "TXT",
      name: "_dmarc.mailer.northwind.example"
    }));
    expect(upsert).toHaveBeenNthCalledWith(3, expect.objectContaining({
      zone_id: "zone_123",
      record_type: "CNAME",
      name: "bounce.mailer.northwind.example"
    }));

    expect(result).toEqual(expect.objectContaining({
      tenantId: "tenant_42",
      domain: "mailer.northwind.example",
      zoneId: "zone_123",
      lifecycle: "dns_configured",
      recordsConfigured: 3
    }));
  });
});
