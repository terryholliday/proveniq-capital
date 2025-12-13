# PROVENIQ INTER-SERVICE CONTRACT
# STRICT ARCHITECTURE RULE: DO NOT DEVIATE

Windsurf, you are now implementing the connectivity layer. 
You must treat the following API MESH as a HARD CONSTRAINT. 
If an endpoint is listed below, it MUST exist. 
If a data dependency is listed, it MUST be typed in `src/shared/types.ts`.

## SERVICE MAP (DOCKER DNS)
- Capital URL: `http://capital:3001`
- ClaimsIQ URL: `http://claimsiq:3000`
- Bids URL: `http://bids:3002`
- Ledger URL: `http://ledger:5432` (Postgres) or `http://ledger:8545` (RPC)

## REQUIRED CONNECTIONS
1. [Capital -> ClaimsIQ]: Capital polls `GET /api/v1/claims/:id/decision` to trigger payouts.
2. [ClaimsIQ -> Bids]: ClaimsIQ POSTs `POST /api/v1/auctions/salvage` when item is Total Loss.
3. [Bids -> Capital]: Bids POSTs `POST /api/v1/remittance` to return liquidation funds.
4. [Home -> ClaimsIQ]: Home POSTs `POST /api/v1/claims/ingest` to start claim.
5. [ALL -> Ledger]: All services must use `LedgerService` adapter to write audit logs.

Confirm you have indexed this dependency map before writing code.---
trigger: manual
---

