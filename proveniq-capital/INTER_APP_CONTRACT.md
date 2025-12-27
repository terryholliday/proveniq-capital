# Proveniq Inter-App Communication Contract
> **Version**: 1.0  
> **Last Updated**: December 2024  
> **Authority**: Proveniq Prime / Terry (Sovereign)

This document defines the **canonical rules** for how Proveniq sub-applications communicate. All teams building HOME, CLAIMSIQ, LEDGER, CAPITAL, and BIDS must adhere to this contract.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PROVENIQ CORE                                  │
│         (Identity, Optical Genome, Provenance Scoring, Fraud)           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
              ┌─────────┐    ┌─────────┐    ┌─────────────┐
              │  HOME   │    │  BIDS   │    │   CAPITAL   │
              └────┬────┘    └────┬────┘    └──────┬──────┘
                   │              │                │
                   └──────────────┼────────────────┘
                                  │
                                  ▼
                         ┌───────────────┐
                         │    LEDGER     │
                         │ (Append-Only) │
                         └───────────────┘
                                  │
                                  ▼
                         ┌───────────────┐
                         │   CLAIMSIQ    │
                         └───────────────┘
```

**Proveniq Core** is the intelligence layer. **Ledger** is the immutable truth sink. All other apps are consumers and producers of events.

---

## 2. Non-Negotiable Principles

| Principle | Rule |
|-----------|------|
| **Zero PII in Ledger** | Use `walletId` (pseudonymous). Real identity lives only in Ghost Protocol Identity service. |
| **Idempotency** | All cross-app API calls and event handlers MUST be idempotent. |
| **Event Sourcing** | State changes are derived from events. Ledger is append-only. |
| **Custody State Machine** | All apps must respect custody transitions. No skipping states. |
| **Provenance Score as Truth** | LTV, trust badges, and claims automation derive from `score.updated` events. |

---

## 3. Event Bus Topics

All apps communicate via a central event bus (Kafka/Pub-Sub). Subscribe only to what you need.

### 3.1 Canonical Event Topics

| Topic | Description | Publisher(s) | Subscriber(s) |
|-------|-------------|--------------|---------------|
| `identity.created` | New item identity registered | HOME | LEDGER, CORE |
| `genome.generated` | Optical Genome vectors created | CORE | LEDGER, CAPITAL, BIDS |
| `genome.verified` | Scan matched against stored genome | CORE | CAPITAL, BIDS, CLAIMSIQ |
| `ledger.event.appended` | New event added to hash chain | LEDGER | ALL |
| `custody.changed` | Item physical location changed | HOME, CAPITAL | BIDS, LEDGER |
| `loan.created` | New loan against collateral | CAPITAL | LEDGER, BIDS |
| `loan.defaulted` | Loan entered default state | CAPITAL | BIDS, LEDGER |
| `auction.listed` | Item listed on Bids | BIDS | LEDGER, CAPITAL |
| `auction.settled` | Auction completed | BIDS | LEDGER, CAPITAL, HOME |
| `claim.created` | Insurance claim initiated | CLAIMSIQ | LEDGER |
| `claim.settled` | Claim resolved | CLAIMSIQ | LEDGER, HOME |
| `score.updated` | Provenance score recalculated | CORE | CAPITAL, BIDS, CLAIMSIQ |
| `fraud.flagged` | Suspicious activity detected | CORE | ALL |

### 3.2 Event Payload Schema (Example)

```json
{
  "eventId": "uuid-v4",
  "eventType": "custody.changed",
  "timestamp": "2024-12-14T10:00:00Z",
  "walletId": "wallet_abc123",
  "itemId": "item_xyz789",
  "payload": {
    "fromState": "HOME",
    "toState": "IN_TRANSIT",
    "carrier": "UPS",
    "trackingNumber": "1Z999AA10123456784"
  },
  "correlationId": "corr_456",
  "version": "1.0"
}
```

---

## 4. Custody State Machine

**All apps MUST respect this state machine. No skipping states.**

```
┌──────────┐     ship      ┌─────────────┐    receive    ┌─────────┐
│   HOME   │ ────────────► │  IN_TRANSIT │ ────────────► │  VAULT  │
└──────────┘               └─────────────┘               └────┬────┘
     ▲                                                        │
     │                    ┌─────────────┐                     │
     │◄───── return ──────│  RETURNED   │◄──── release ───────┤
     │                    └─────────────┘                     │
     │                                                        │
     │                    ┌─────────────┐                     │
     └◄───── sold ────────│    SOLD     │◄──── auction ───────┘
                          └─────────────┘
```

### Valid Transitions

| From | To | Triggered By |
|------|----|--------------|
| `HOME` | `IN_TRANSIT` | User ships item (HOME, CAPITAL) |
| `IN_TRANSIT` | `VAULT` | Vault confirms receipt (CAPITAL) |
| `VAULT` | `SOLD` | Auction settles (BIDS) |
| `VAULT` | `RETURNED` | Loan repaid / no sale (CAPITAL, BIDS) |
| `RETURNED` | `HOME` | User receives item back |
| `SOLD` | `HOME` | Buyer receives item |

**Invalid transitions (will be rejected by Ledger):**
- `HOME` → `VAULT` (must go through `IN_TRANSIT`)
- `IN_TRANSIT` → `SOLD` (must go through `VAULT`)

---

## 5. Integration Layer APIs

Each app exposes an Integration Layer for cross-app communication.

### 5.1 HOME Integration Layer

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/home/items/{itemId}` | GET | Get item details |
| `/v1/home/items/{itemId}/custody` | POST | Initiate custody transition |
| `/v1/home/items/{itemId}/provenance` | GET | Get provenance summary |

### 5.2 CAPITAL Integration Layer

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/capital/ltv-recommendation` | POST | Get LTV recommendation for item |
| `/v1/capital/loans/{loanId}/events` | POST | Record loan lifecycle event |
| `/v1/capital/loans/{loanId}/status` | GET | Get loan status |
| `/v1/capital/collateral/{itemId}` | GET | Get collateral status |

**Request: LTV Recommendation**
```json
POST /v1/capital/ltv-recommendation
{
  "itemId": "item_xyz789",
  "walletId": "wallet_abc123",
  "requestedAmount": 5000.00
}
```

**Response:**
```json
{
  "itemId": "item_xyz789",
  "provenanceScore": 87,
  "estimatedValue": 12000.00,
  "maxLTV": 0.65,
  "maxLoanAmount": 7800.00,
  "riskTier": "A",
  "constraints": ["GENOME_VERIFIED", "CUSTODY_REQUIRED"]
}
```

### 5.3 BIDS Integration Layer

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/bids/items/{itemId}/provenance-summary` | GET | Get provenance for listing display |
| `/v1/bids/sales/{saleId}/confirm-delivery` | POST | Confirm buyer received item |
| `/v1/bids/listings` | POST | Create auction listing |
| `/v1/bids/listings/{listingId}/status` | GET | Get listing status |

**Request: Provenance Summary**
```json
GET /v1/bids/items/{itemId}/provenance-summary
```

**Response:**
```json
{
  "itemId": "item_xyz789",
  "provenanceScore": 87,
  "trustBadges": ["GENOME_VERIFIED", "ORIGINAL_RECEIPT", "VAULT_CUSTODY"],
  "ownershipHistory": 2,
  "lastVerified": "2024-12-10T14:30:00Z",
  "fraudFlags": []
}
```

### 5.4 CLAIMSIQ Integration Layer

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/claimsiq/items/{itemId}/preloss-provenance` | GET | Get pre-loss provenance for claims |
| `/v1/claimsiq/claims/{claimId}/events` | POST | Record claim lifecycle event |
| `/v1/claimsiq/claims/{claimId}/status` | GET | Get claim status |

**Request: Pre-Loss Provenance**
```json
GET /v1/claimsiq/items/{itemId}/preloss-provenance
```

**Response:**
```json
{
  "itemId": "item_xyz789",
  "provenanceScore": 87,
  "documentedValue": 12000.00,
  "evidencePackage": {
    "photos": 12,
    "receipts": 2,
    "genomeVerified": true,
    "lastConditionScore": 92
  },
  "claimReadiness": "HIGH"
}
```

### 5.5 LEDGER Integration Layer

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/ledger/events` | POST | Append event to hash chain |
| `/v1/ledger/items/{itemId}/events` | GET | Get item event history |
| `/v1/ledger/events/{eventId}` | GET | Get specific event |
| `/v1/ledger/wallets/{walletId}/history` | GET | Get wallet history |

**Request: Append Event**
```json
POST /v1/ledger/events
{
  "eventType": "custody.changed",
  "walletId": "wallet_abc123",
  "itemId": "item_xyz789",
  "payload": {
    "fromState": "HOME",
    "toState": "IN_TRANSIT"
  },
  "sourceApp": "HOME",
  "correlationId": "corr_456"
}
```

**Response:**
```json
{
  "eventId": "evt_abc123",
  "hashChainPosition": 1847293,
  "previousHash": "sha256:abc...",
  "eventHash": "sha256:def...",
  "timestamp": "2024-12-14T10:00:00Z"
}
```

---

## 6. App-Specific Contracts

### 6.1 HOME

**Responsibilities:**
- User onboarding and item registration
- Inventory management
- Estate & Legacy features
- Initiating custody transitions

**Must Consume:**
| Event | Action |
|-------|--------|
| `score.updated` | Update item provenance display |
| `auction.settled` | Mark item as sold, update inventory |
| `claim.settled` | Update item status post-claim |

**Must Publish:**
| Event | When |
|-------|------|
| `identity.created` | New item registered |
| `custody.changed` | User ships item |

---

### 6.2 CLAIMSIQ

**Responsibilities:**
- Pre-loss documentation
- Claims automation
- Insurance partner integration

**Must Consume:**
| Event | Action |
|-------|--------|
| `genome.verified` | Update claim evidence package |
| `score.updated` | Recalculate claim readiness |
| `fraud.flagged` | Flag claim for manual review |

**Must Publish:**
| Event | When |
|-------|------|
| `claim.created` | New claim initiated |
| `claim.settled` | Claim resolved (paid/denied) |

---

### 6.3 LEDGER

**Responsibilities:**
- Immutable event storage
- Hash chain integrity
- Audit trail

**Must Consume:**
| Event | Action |
|-------|--------|
| ALL events | Append to hash chain |

**Must Publish:**
| Event | When |
|-------|------|
| `ledger.event.appended` | Every event appended |

**Special Rules:**
- NEVER delete events
- NEVER modify events
- Reject invalid custody transitions
- Maintain hash chain integrity

---

### 6.4 CAPITAL

**Responsibilities:**
- Loan origination
- Collateral management
- Default/recovery workflows

**Must Consume:**
| Event | Action |
|-------|--------|
| `genome.generated` | Enable item as collateral |
| `genome.verified` | Update collateral confidence |
| `score.updated` | Recalculate LTV |
| `auction.settled` | Close loan if collateral sold |
| `fraud.flagged` | Freeze loan, escalate |

**Must Publish:**
| Event | When |
|-------|------|
| `loan.created` | New loan originated |
| `loan.defaulted` | Loan enters default |
| `custody.changed` | Item moves to/from vault |

---

### 6.5 BIDS

**Responsibilities:**
- Auction management
- Marketplace listings
- Buyer/seller matching

**Must Consume:**
| Event | Action |
|-------|--------|
| `genome.verified` | Display trust badge |
| `score.updated` | Update listing provenance display |
| `loan.defaulted` | Enable recovery auction |
| `custody.changed` | Update listing availability |
| `fraud.flagged` | Delist item, notify parties |

**Must Publish:**
| Event | When |
|-------|------|
| `auction.listed` | Item listed for auction |
| `auction.settled` | Auction completes (sold/unsold) |

---

## 7. Authentication & Authorization

### 7.1 Service-to-Service Auth

All inter-app calls use **mTLS + JWT**.

```
Authorization: Bearer <service_jwt>
X-Service-Name: proveniq-home
X-Correlation-Id: corr_456
```

### 7.2 Scopes

| Scope | Description | Apps |
|-------|-------------|------|
| `ledger:write` | Append events to ledger | ALL |
| `ledger:read` | Read ledger events | ALL |
| `capital:ltv` | Request LTV recommendations | HOME, BIDS |
| `bids:list` | Create auction listings | HOME, CAPITAL |
| `claimsiq:evidence` | Access pre-loss evidence | Insurance Partners |

---

## 8. Error Handling

### 8.1 Standard Error Response

```json
{
  "error": {
    "code": "INVALID_CUSTODY_TRANSITION",
    "message": "Cannot transition from HOME to VAULT directly",
    "details": {
      "currentState": "HOME",
      "requestedState": "VAULT",
      "validTransitions": ["IN_TRANSIT"]
    }
  },
  "correlationId": "corr_456",
  "timestamp": "2024-12-14T10:00:00Z"
}
```

### 8.2 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_CUSTODY_TRANSITION` | 400 | Custody state machine violation |
| `ITEM_NOT_FOUND` | 404 | Item does not exist |
| `INSUFFICIENT_PROVENANCE` | 422 | Provenance score too low for action |
| `FRAUD_BLOCKED` | 403 | Item flagged for fraud |
| `LEDGER_HASH_MISMATCH` | 500 | Hash chain integrity failure |

---

## 9. SLAs

| Service | Availability | Latency (p95) |
|---------|--------------|---------------|
| LEDGER | 99.99% | < 50ms (writes), < 100ms (reads) |
| CORE | 99.9% | < 300ms (identity), < 1500ms (genome) |
| HOME | 99.9% | < 250ms |
| CAPITAL | 99.9% | < 200ms |
| BIDS | 99.9% | < 200ms |
| CLAIMSIQ | 99.9% | < 200ms |

---

## 10. Versioning

- All APIs are versioned: `/v1/`, `/v2/`, etc.
- Event schemas include `version` field
- Breaking changes require new major version
- Deprecation notice: 6 months minimum

---

## 11. Checklist for Sub-App Teams

Before going live, verify:

- [ ] Subscribed to required event topics
- [ ] Publishing required events with correct schema
- [ ] Integration Layer APIs implemented
- [ ] mTLS + JWT auth configured
- [ ] Custody state machine respected
- [ ] Idempotency implemented for all handlers
- [ ] Error codes match contract
- [ ] SLAs achievable
- [ ] No PII in Ledger payloads

---

**Questions?** Escalate to Proveniq Prime.

---
*© 2024 ProvenIQ Technologies. Confidential.*
