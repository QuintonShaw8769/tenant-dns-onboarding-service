import express from "express";
import type { InfraiClient } from "./infrai_client.js";
import { tenantDomainInputSchema, onboardTenantDomain } from "./tenant_dns_service.js";
import { ZodError } from "zod";
import { InfraiError } from "./infrai_client.js";

export function createAdminRouter(infrai: InfraiClient) {
  const router = express.Router();

  router.post("/admin/tenants/onboard-domain", async (req, res) => {
    try {
      const input = tenantDomainInputSchema.parse(req.body);
      const result = await onboardTenantDomain(infrai, input);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: "Invalid request body", issues: error.issues });
        return;
      }

      if (error instanceof InfraiError) {
        res.status(error.status >= 400 && error.status < 500 ? error.status : 502).json({
          message: error.message,
          details: error.details
        });
        return;
      }

      res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  return router;
}
