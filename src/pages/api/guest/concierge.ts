import type { APIRoute } from "astro";
import { z } from "zod";
import { OPENAI_API_KEY } from "astro:env/server";
import OpenAI from "openai";
import { buildSystemPrompt } from "@/lib/hotel-context";

export const prerender = false;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(6),
});

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

  if (!OPENAI_API_KEY) {
    return Response.json({ error: "Concierge unavailable." }, { status: 503 });
  }

  const { roomNumber, checkOutDate } = guestToken;
  const systemPrompt = buildSystemPrompt({ roomNumber, checkOutDate });

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, ...result.data.messages],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return Response.json({ error: "Concierge unavailable. Please try again." }, { status: 502 });
    }

    return Response.json({ content });
  } catch {
    return Response.json({ error: "Concierge unavailable. Please try again." }, { status: 502 });
  }
};
