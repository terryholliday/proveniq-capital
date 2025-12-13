# Proveniq Capital - Treasury OS

**Algorithmic Central Bank for Proveniq Insurance Pools**

## Overview

Proveniq Capital is the autonomous underwriting and settlement engine that powers the Proveniq ecosystem. It is not a wallet — it is financial infrastructure that:

1. **Underwrites (Ingress):** Accepts premiums, holds them in reserve pools
2. **Settles (Egress):** Listens to ClaimsIQ verdicts and releases funds instantly

## Design Philosophy

- **Zero-Trust:** We don't trust users. We trust the ClaimsIQ Audit Seal.
- **Idempotency:** Never pay the same claim twice.
- **Ledger-First:** Every cent moved is written to the General Ledger.
- **Double-Entry:** All transactions create balanced debit/credit pairs.

## Architecture

```
/src
  /core
    /ledger         # Double-Entry General Ledger
    /treasury       # Liquidity Pool Management
  /modules
    /claims-listener # ClaimsIQ Integration (Polling/Webhooks)
    /payouts        # Payment Rails (Stripe/USDC)
  /api              # Internal Admin API
  /database         # PostgreSQL Schema & Migrations
  /shared           # Shared Types
```

## The Core Loop

### STATE 1: THE WATCHTOWER
- Poll ClaimsIQ or receive webhook for new `DecisionRecord`
- Verify `status === 'PAY'`
- Verify cryptographic seal
- Check idempotency (already paid?)
- If valid → Initiate Payout

### STATE 2: THE LIQUIDITY CHECK
- Check if `LIABILITY_RESERVE` has sufficient funds
- If insufficient → HALT (Critical Liquidity Failure)
- If sufficient → Lock funds

### STATE 3: THE RAIL SWITCH
- If amount < $10,000 → Automated Stripe Payout
- If amount ≥ $10,000 → Queue for Manual Treasury Approval

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Stripe Account (for fiat payouts)

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# - DATABASE_URL
# - CLAIMSIQ_BASE_URL
# - STRIPE_SECRET_KEY
# - ADMIN_API_KEY

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

### Production

```bash
# Build
npm run build

# Start
npm start
```

## API Endpoints

### Public
- `GET /health` - Health check

### Webhooks
- `POST /webhooks/claimsiq` - Receive ClaimsIQ decision notifications

### Admin (requires `x-api-key` header)
- `GET /admin/health` - System health with treasury & ledger status
- `GET /admin/treasury/pools` - List liquidity pools
- `POST /admin/treasury/pools` - Create new pool
- `POST /admin/treasury/pools/:id/fund` - Add funds to pool
- `GET /admin/treasury/alerts` - Active alerts
- `POST /admin/treasury/alerts/:id/acknowledge` - Acknowledge alert
- `GET /admin/payouts/pending` - Payouts awaiting manual approval
- `POST /admin/payouts/:id/approve` - Approve manual payout
- `GET /admin/payouts/:id` - Payout details
- `GET /admin/ledger/integrity` - Verify ledger integrity
- `GET /admin/ledger/entries/:referenceId` - Ledger entries for policy/claim

## Data Models

### GeneralLedgerEntry
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Entry ID |
| account_type | Enum | LIABILITY_RESERVE, OPERATING_CASH, CLAIMS_PAYABLE |
| entry_type | Enum | DEBIT, CREDIT |
| amount | BigInt | Amount in cents (NO FLOATING POINT) |
| currency | Enum | USD, USDC |
| reference_id | String | Policy ID or Claim ID |

### PayoutTransaction
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Payout ID |
| claim_id | UUID | ClaimsIQ Decision ID |
| recipient_did | String | Recipient DID |
| status | Enum | PENDING, LOCKED, MANUAL_REVIEW, PROCESSING, CLEARED, FAILED |
| tx_hash | String | Bank reference or blockchain hash |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 3100 |
| DATABASE_URL | PostgreSQL connection string | - |
| CLAIMSIQ_BASE_URL | ClaimsIQ API URL | http://localhost:3000 |
| CLAIMSIQ_API_KEY | ClaimsIQ API key | - |
| CLAIMSIQ_WEBHOOK_SECRET | Webhook signature secret | - |
| STRIPE_SECRET_KEY | Stripe API key | - |
| ADMIN_API_KEY | Admin API authentication | - |
| MANUAL_APPROVAL_THRESHOLD_CENTS | Amount requiring approval | 1000000 ($10,000) |
| CRITICAL_RESERVE_MINIMUM_CENTS | Halt threshold | 10000000 ($100,000) |
| ENABLE_CLAIMS_POLLING | Enable polling mode | false |
| CLAIMS_POLL_INTERVAL_MS | Polling interval | 30000 |

## Double-Entry Accounting

All financial movements create balanced entries:

### Premium Received
```
DEBIT:  OPERATING_CASH      +$1000
CREDIT: LIABILITY_RESERVE   +$1000
```

### Claim Approved
```
DEBIT:  LIABILITY_RESERVE   -$500
CREDIT: CLAIMS_PAYABLE      +$500
```

### Claim Paid
```
DEBIT:  CLAIMS_PAYABLE      -$500
CREDIT: OPERATING_CASH      -$500
```

## Security

- All admin endpoints require API key authentication
- Webhook endpoints verify HMAC signatures
- ClaimsIQ decisions require valid audit seals
- Idempotency keys prevent duplicate payouts
- Fund locks prevent double-spending during settlement

## License

PROPRIETARY - Proveniq Inc.
