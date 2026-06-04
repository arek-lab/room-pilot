// Rows required in cloud Supabase before running E2E tests.
// Run the SQL block below once via Supabase Dashboard → SQL editor.
//
// INSERT INTO room_qr_codes (id, qr_token, room_number, active)
// VALUES ('10000000-0000-0000-0000-000000000001','e2e-room-101','101-E2E',true)
// ON CONFLICT (id) DO NOTHING;

// INSERT INTO packages (id, name, active)
// VALUES ('20000000-0000-0000-0000-000000000001','E2E Test Package',true)
// ON CONFLICT (id) DO NOTHING;

// INSERT INTO services (id, name, category, active, price_pln)
// VALUES ('30000000-0000-0000-0000-000000000001','E2E Massage','wellness',true,100)
// ON CONFLICT (id) DO NOTHING;

// INSERT INTO package_services (id, package_id, service_id, inclusion_type)
// VALUES ('40000000-0000-0000-0000-000000000001',
//         '20000000-0000-0000-0000-000000000001',
//         '30000000-0000-0000-0000-000000000001',
//         'addon')
// ON CONFLICT (id) DO NOTHING;
//
// Staff account: create in Supabase Auth dashboard, set
//   raw_app_meta_data: {"staff_role":"staff"}
// Then copy credentials to .env.test (see .env.test.example).

export const SEED = {
  roomQrToken: "e2e-room-101", // room_qr_codes.qr_token — used in /qr/room/<value>
  roomNumber: "101-E2E", // room_qr_codes.room_number (must match guest token)
  packageId: "20000000-0000-0000-0000-000000000001",
  serviceName: "E2E Massage", // services.name — locator for the addon card
} as const;
