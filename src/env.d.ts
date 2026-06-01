interface GuestTokenLocals {
  tokenId: string;
  roomNumber: string;
  packageId: string;
  checkOutDate: string;
  exp: number;
}

declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    guestToken: GuestTokenLocals | null;
  }
}
