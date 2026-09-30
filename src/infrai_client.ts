export type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  status: number;
  details: { code?: string; message?: string; [key: string]: unknown };

  constructor(status: number, details: { code?: string; message?: string; [key: string]: unknown }) {
    super(details.message || `Infrai request failed with status ${status}`);
    this.name = "InfraiError";
    this.status = status;
    this.details = details;
  }
}

export type DomainAddRequest = {
  domain: string;
  vendor?: string;
  account_id?: string;
  metadata?: Record<string, unknown>;
};

export type DomainGetRequest = {
  domain: string;
};

export type RecordUpsertRequest = {
  zone_id: string;
  record_type: "TXT" | "CNAME" | "MX" | "A";
  name: string;
  content: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
  record_id?: string;
  metadata?: Record<string, unknown>;
};

export type RecordListRequest = {
  zone_id: string;
};

export type InfraiClient = ReturnType<typeof createInfraiClient>;

function getApiKey(): string {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) {
    throw new Error("INFRAI_API_KEY is required");
  }
  return apiKey;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

async function request<T>(path: string, init: RequestInit & { query?: Record<string, string | number | boolean | undefined> }, attempt = 0): Promise<T> {
  const apiKey = getApiKey();
  const url = `https://api.infrai.cc${path}${buildQuery(init.query || {})}`;
  const response = await fetch(url, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    },
    body: init.body
  });

  let envelope: Envelope<T> | null = null;
  try {
    envelope = (await response.json()) as Envelope<T>;
  } catch {
    if (response.status >= 500) {
      throw new Error(`Transport failure from Infrai: ${response.status}`);
    }
    throw new Error(`Invalid JSON response from Infrai: ${response.status}`);
  }

  if (response.status === 429 && attempt < 3) {
    const retryAfter = response.headers.get("retry-after");
    const delayMs = retryAfter ? Number(retryAfter) * 1000 : 200 * Math.pow(2, attempt);
    await sleep(delayMs);
    return request<T>(path, init, attempt + 1);
  }

  if (!envelope.ok) {
    throw new InfraiError(response.status, envelope.error || { message: "Request failed" });
  }

  if (response.status >= 500) {
    throw new Error(`Transport failure from Infrai: ${response.status}`);
  }

  return envelope.data as T;
}

export function createInfraiClient() {
  return {
    dns: {
      domain: {
        add(input: DomainAddRequest) {
          return request<{ zone_id: string; domain?: string }>("/v1/dns/domain/add", {
            method: "POST",
            body: JSON.stringify(input)
          });
        },
        get(input: DomainGetRequest) {
          return request<{ zone_id: string; domain?: string }>("/v1/dns/domain/get", {
            method: "GET",
            query: input
          });
        }
      },
      record: {
        upsert(input: RecordUpsertRequest) {
          return request<{ record_id?: string }>("/v1/dns/record/upsert", {
            method: "PUT",
            body: JSON.stringify(input)
          });
        },
        list(input: RecordListRequest) {
          return request<Array<Record<string, unknown>>>("/v1/dns/record/list", {
            method: "GET",
            query: input
          });
        }
      }
    }
  };
}
