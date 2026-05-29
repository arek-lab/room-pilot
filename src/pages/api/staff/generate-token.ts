import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const schema = z
  .object({
    guestName: z.string().min(1),
    roomNumber: z.string().min(1),
    packageId: z.string().regex(uuidPattern),
    checkInDate: z.string().regex(datePattern),
    checkOutDate: z.string().regex(datePattern),
  })
  .refine((data) => data.checkOutDate > data.checkInDate, {
    message: "Check-out date must be after check-in date",
  });

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (context.locals.user.app_metadata?.staff_role !== "staff") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return Response.json({ error: result.error.issues[0]?.message ?? "Validation error" }, { status: 400 });
  }

  const { guestName, roomNumber, packageId, checkInDate, checkOutDate } = result.data;
  const tokenValue = crypto.randomUUID();

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Failed to create token" }, { status: 500 });
  }

  const { data: inserted, error } = await supabase
    .from("guest_tokens")
    .insert({
      token_value: tokenValue,
      guest_name: guestName,
      room_number: roomNumber,
      package_id: packageId,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      created_by: context.locals.user.id,
    })
    .select("id")
    .single();

  if (error) {
    console.error("guest_tokens insert error:", error);
    return Response.json({ error: "Failed to create token" }, { status: 500 });
  }

  return Response.json({
    tokenValue,
    tokenId: inserted.id,
    guestName,
    roomNumber,
    checkInDate,
    checkOutDate,
  });
};
