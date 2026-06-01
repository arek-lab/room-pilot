import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { jwtVerify } from "jose";
import { GUEST_SESSION_SECRET } from "astro:env/server";

const PROTECTED_ROUTES = ["/dashboard"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  const guestCookie = context.cookies.get("guest_session")?.value;
  if (guestCookie && GUEST_SESSION_SECRET) {
    try {
      const secret = new TextEncoder().encode(GUEST_SESSION_SECRET);
      const { payload } = await jwtVerify(guestCookie, secret, { algorithms: ["HS256"] });
      context.locals.guestToken = {
        tokenId: payload.tokenId as string,
        roomNumber: payload.roomNumber as string,
        packageId: payload.packageId as string,
        checkOutDate: payload.checkOutDate as string,
        exp: payload.exp ?? 0,
      };
    } catch {
      context.locals.guestToken = null;
    }
  } else {
    context.locals.guestToken = null;
  }

  return next();
});
