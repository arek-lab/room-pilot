import { createServiceRoleClient } from "@/lib/supabase";
import { GET, POST } from "@/pages/api/guest/orders/index";
import { PATCH } from "@/pages/api/guest/orders/[id]";

vi.mock("astro:env/server", () => ({
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  GUEST_SESSION_SECRET: process.env.GUEST_SESSION_SECRET ?? "a".repeat(64),
}));

const BASIC_PKG = "00000000-0000-0000-0002-000000000001";
const STANDARD_PKG = "00000000-0000-0000-0002-000000000002";
const BASEN_SVC = "00000000-0000-0000-0001-000000000003";
const WIFI_SVC = "00000000-0000-0000-0001-000000000001";
const ROOM_SVC_SVC = "00000000-0000-0000-0001-000000000007";

function getTestClient() {
  const client = createServiceRoleClient();
  if (!client)
    throw new Error(
      "Supabase service role client unavailable — check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env",
    );
  return client;
}

function makeGuestApiContext(
  guestToken: App.Locals["guestToken"],
  body?: unknown,
  routeParams?: Record<string, string>,
) {
  return {
    locals: { guestToken, user: null },
    request: new Request("http://localhost/", {
      method: body !== undefined ? "POST" : "GET",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
    params: routeParams ?? {},
    cookies: {
      get: vi.fn(),
      getAll: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    },
  } as unknown as Parameters<typeof GET>[0];
}

let tokenAId = "";
let tokenBId = "";
let createdOrderIds: string[] = [];

function makeTokenA(): App.Locals["guestToken"] {
  return {
    tokenId: tokenAId,
    roomNumber: "101",
    packageId: BASIC_PKG,
    checkOutDate: "2099-12-31",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
}

beforeAll(async () => {
  tokenAId = crypto.randomUUID();
  tokenBId = crypto.randomUUID();
  const supabase = getTestClient();
  const { error } = await supabase.from("guest_tokens").insert([
    {
      id: tokenAId,
      package_id: BASIC_PKG,
      room_number: "101",
      guest_name: "Test Guest A",
      check_in_date: "2099-12-01",
      check_out_date: "2099-12-31",
    },
    {
      id: tokenBId,
      package_id: STANDARD_PKG,
      room_number: "102",
      guest_name: "Test Guest B",
      check_in_date: "2099-12-01",
      check_out_date: "2099-12-31",
    },
  ]);
  if (error) throw new Error(`beforeAll: failed to insert guest_tokens: ${error.message}`);
});

afterAll(async () => {
  const supabase = getTestClient();
  await supabase.from("orders").delete().in("guest_token_id", [tokenAId, tokenBId]);
  await supabase.from("guest_tokens").delete().in("id", [tokenAId, tokenBId]);
});

afterEach(async () => {
  if (createdOrderIds.length === 0) return;
  const supabase = getTestClient();
  await supabase.from("orders").delete().in("id", createdOrderIds);
  createdOrderIds = [];
});

describe("Authorization — 401 guard", () => {
  it("GET bez guestToken → 401", async () => {
    const ctx = makeGuestApiContext(null);
    const res = await GET(ctx);
    expect(res.status).toBe(401);
  });

  it("POST bez guestToken → 401", async () => {
    const ctx = makeGuestApiContext(null, { serviceId: BASEN_SVC });
    const res = await POST(ctx);
    expect(res.status).toBe(401);
  });

  it("PATCH bez guestToken → 401", async () => {
    const ctx = makeGuestApiContext(null, undefined, { id: crypto.randomUUID() });
    const res = await PATCH(ctx);
    expect(res.status).toBe(401);
  });
});

describe("Risk #4 — Order state machine", () => {
  it("POST valid addon → 201 i status pending w DB", async () => {
    const ctx = makeGuestApiContext(makeTokenA(), { serviceId: BASEN_SVC });
    const res = await POST(ctx);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { orderId: string; status: string };
    expect(body.status).toBe("pending");
    createdOrderIds.push(body.orderId);

    const supabase = getTestClient();
    const { data } = await supabase.from("orders").select("status").eq("id", body.orderId).single();
    expect(data?.status).toBe("pending");
  });

  it("PATCH cancel pending → 200 i status cancelled w DB", async () => {
    const supabase = getTestClient();
    const { data: inserted, error } = await supabase
      .from("orders")
      .insert({ guest_token_id: tokenAId, service_id: BASEN_SVC })
      .select("id")
      .single();
    if (error) throw new Error(`Setup failed: ${error.message}`);
    createdOrderIds.push(inserted.id);

    const ctx = makeGuestApiContext(makeTokenA(), undefined, { id: inserted.id });
    const res = await PATCH(ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("cancelled");

    const { data } = await supabase.from("orders").select("status").eq("id", inserted.id).single();
    expect(data?.status).toBe("cancelled");
  });

  it("PATCH cancel fulfilled → 409", async () => {
    const supabase = getTestClient();
    const { data: inserted, error } = await supabase
      .from("orders")
      .insert({ guest_token_id: tokenAId, service_id: BASEN_SVC, status: "fulfilled" })
      .select("id")
      .single();
    if (error) throw new Error(`Setup failed: ${error.message}`);
    createdOrderIds.push(inserted.id);

    const ctx = makeGuestApiContext(makeTokenA(), undefined, { id: inserted.id });
    const res = await PATCH(ctx);
    expect(res.status).toBe(409);
  });
});

describe("Risk #5 — Service authorization", () => {
  it("POST included service (WiFi w Basic) → 403", async () => {
    const ctx = makeGuestApiContext(makeTokenA(), { serviceId: WIFI_SVC });
    const res = await POST(ctx);
    expect(res.status).toBe(403);
  });

  it("POST out-of-package service (Room service w Basic) → 403", async () => {
    const ctx = makeGuestApiContext(makeTokenA(), { serviceId: ROOM_SVC_SVC });
    const res = await POST(ctx);
    expect(res.status).toBe(403);
  });

  it("POST valid addon (Basen w Basic) → 201", async () => {
    const ctx = makeGuestApiContext(makeTokenA(), { serviceId: BASEN_SVC });
    const res = await POST(ctx);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { orderId: string };
    createdOrderIds.push(body.orderId);
  });
});

describe("Risk #6 — IDOR guest isolation", () => {
  it("GET z tokenem A nie zwraca zamówień gościa B", async () => {
    const supabase = getTestClient();
    const { data: inserted, error } = await supabase
      .from("orders")
      .insert({ guest_token_id: tokenBId, service_id: BASEN_SVC })
      .select("id")
      .single();
    if (error) throw new Error(`Setup failed: ${error.message}`);
    createdOrderIds.push(inserted.id);

    const ctx = makeGuestApiContext(makeTokenA());
    const res = await GET(ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    const ids = body.map((o) => o.id);
    expect(ids).not.toContain(inserted.id);
  });

  it("PATCH z tokenem A na zamówieniu gościa B → 404", async () => {
    const supabase = getTestClient();
    const { data: inserted, error } = await supabase
      .from("orders")
      .insert({ guest_token_id: tokenBId, service_id: BASEN_SVC })
      .select("id")
      .single();
    if (error) throw new Error(`Setup failed: ${error.message}`);
    createdOrderIds.push(inserted.id);

    const ctx = makeGuestApiContext(makeTokenA(), undefined, { id: inserted.id });
    const res = await PATCH(ctx);
    expect(res.status).toBe(404);
  });
});
