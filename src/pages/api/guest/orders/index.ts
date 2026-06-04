import type { APIRoute } from "astro";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase";

export const prerender = false;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  serviceId: z.string().regex(uuidPattern, "serviceId must be a valid UUID"),
});

export const GET: APIRoute = async (context) => {
  const guestToken = context.locals.guestToken;
  if (!guestToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tokenId } = guestToken;
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 500 });
  }

  const { data: rows, error } = await supabase
    .from("orders")
    .select("id, service_id, status, created_at")
    .eq("guest_token_id", tokenId)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: "Failed to fetch orders" }, { status: 500 });
  }

  return Response.json(rows);
};

export const POST: APIRoute = async (context) => {
  const guestToken = context.locals.guestToken;
  if (!guestToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = bodySchema.safeParse(body);
  if (!result.success) {
    return Response.json({ error: result.error.issues[0]?.message ?? "Validation error" }, { status: 400 });
  }

  const { serviceId } = result.data;
  const { tokenId, packageId } = guestToken;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 500 });
  }

  const { data: addonRow } = await supabase
    .from("package_services")
    .select("id")
    .eq("package_id", packageId)
    .eq("service_id", serviceId)
    .eq("inclusion_type", "addon")
    .maybeSingle();

  if (!addonRow) {
    return Response.json({ error: "Service not available" }, { status: 403 });
  }

  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id")
    .eq("guest_token_id", tokenId)
    .eq("service_id", serviceId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingOrder) {
    return Response.json({ error: "Order already pending" }, { status: 409 });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("orders")
    .insert({ guest_token_id: tokenId, service_id: serviceId })
    .select("id")
    .single();

  if (insertError) {
    console.error("orders insert error:", insertError);
    return Response.json({ error: "Failed to place order" }, { status: 500 });
  }

  return Response.json({ orderId: inserted.id, status: "pending" }, { status: 201 });
};
