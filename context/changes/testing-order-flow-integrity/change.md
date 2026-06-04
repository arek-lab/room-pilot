---
change_id: testing-order-flow-integrity
title: Order flow integrity — integration tests for order CRUD, cancel gate, service authorization, and guest isolation
status: implemented
created: 2026-06-04
updated: 2026-06-04

archived_at: null
---

## Notes

Phase 2 from context/foundation/test-plan.md. Covers risks #4, #5, #6: order state machine, unauthorized service ordering, and IDOR guest isolation. Tests are integration-layer (API + real Supabase) — no database mocking per test plan constraint.
