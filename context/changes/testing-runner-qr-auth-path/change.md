---
change_id: testing-runner-qr-auth-path
title: Runner + QR auth path — Phase 1 test coverage
status: implemented
created: 2026-06-02
updated: 2026-06-02
archived_at: null
---

## Notes

Rollout Phase 1 of context/foundation/test-plan.md: "Runner + QR auth path".
Risks covered: R1 (2-step QR auth broken), R2 (middleware regression),
R3 (token expiry not enforced).
Test types planned: unit (middleware JWT), integration (QR route +
session issuance).
Risk response intent:
- R1: prove that pending_guest cookie + valid qr_token → guest_session
  cookie issued with correct claims (tokenId, roomNumber, packageId, exp);
  challenge "token valid" ≠ "session issued correctly".
- R2: prove middleware populates guestToken for valid JWT and returns null
  (no 500) for expired/tampered/missing cookie; test both guest and staff
  paths; challenge "works in Node" ≠ untested Workers gap.
- R3: prove request with past exp claim → 401/redirect, not panel access;
  challenge "JWT parses" ≠ "exp enforced".
