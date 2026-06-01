import type { APIRoute } from "astro";
import { createServiceRoleClient } from "@/lib/supabase";

export const prerender = false;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PATCH: APIRoute = async (context) => {
  const guestToken = context.locals.guestToken;
  if (!guestToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = context.params.id;
  if (!id || !uuidPattern.test(id)) {
    return Response.json({ error: "Invalid order id" }, { status: 400 });
  }

  const { tokenId } = guestToken;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 500 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", id)
    .eq("guest_token_id", tokenId)
    .maybeSingle();

  if (!order) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status !== "pending") {
    return Response.json({ error: "Order cannot be cancelled" }, { status: 409 });
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "pending");

  if (updateError) {
    console.error("orders update error:", updateError);
    return Response.json({ error: "Failed to cancel order" }, { status: 500 });
  }

  return Response.json({ status: "cancelled" });
};
