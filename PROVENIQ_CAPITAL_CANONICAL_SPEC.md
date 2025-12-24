# PROVENIQ CAPITAL
# Canonical Product & Architecture Specification (v1.0)

## I. ONE-LINE DEFINITION (NON-NEGOTIABLE)

**PROVENIQ Capital** is an asset-backed lending marketplace that originates, prices, and distributes loans secured by Ledger-verified physical assets.

Anything that contradicts this is wrong.

## II. THE PROBLEM CAPITAL SOLVES (WHY IT EXISTS)

### The Global Failure
Trillions of dollars of real, owned physical assets are:
- Illiquid
- Undervalued
- Unfinanceable
- Distrusted by lenders

**Why?**
- Ownership is unverifiable
- Condition is unknown
- Custody is unclear
- Valuation is stale
- Fraud risk is high

### Capital’s Breakthrough
Capital eliminates trust gaps by using Proveniq’s infrastructure:
**If an asset can be proven, it can be financed.**
This converts dead capital → live capital.

## III. WHAT CAPITAL IS (AND IS NOT)

### Capital IS
- A loan origination engine
- A risk-priced lending marketplace
- A collateral intelligence system
- A distribution platform for public & institutional capital
- A covenant-enforcing agent powered by Ledger truth

### Capital IS NOT
- A generic payments processor
- A treasury wallet
- A consumer bank
- A dumb escrow service
- A balance-sheet-heavy lender (by default)

**Capital moves obligations, not just money.**

## IV. WHO CAPITAL SERVES (TWO SIDES)

### 1. Borrowers (Demand Side)
Borrowers come from existing Proveniq products:

| Source App | Borrower Type | Example Loans |
| :--- | :--- | :--- |
| **Home** | Consumers | Jewelry loans, vehicle loans, collectible-backed credit |
| **Properties** | Landlords / Owners | Equity extraction, renovation loans, bridge financing |
| **Ops** | Businesses | Equipment financing, inventory loans, working capital |

**Borrower benefits:**
- Lower rates (reduced risk)
- Faster approval
- No subjective appraisals
- Dynamic credit lines tied to asset health

### 2. Capital Providers (Supply Side)
Capital sells loans to:
- Retail investors
- Accredited investors
- Family offices
- Funds / SPVs
- (Later) institutions

**Provider benefits:**
- Verified collateral
- Continuous monitoring
- Automated covenant enforcement
- Transparent recovery paths

## V. CAPITAL’S CORE ADVANTAGE (THE MOAT)

| Traditional Lending | Proveniq Capital |
| :--- | :--- |
| Static appraisal | **Continuous LTV recalculation** |
| Borrower trust | **Signal Source** (Anchors, Service, Transit, Protect, Core) |
| Manual underwriting | **Dynamic interest rates** |
| Surprise defaults | **Automated covenant triggers** |

**This is not incremental. This is category-defining.**

## VI. CAPITAL SUBSYSTEMS (ARCHITECTURAL CLARITY)

Capital is one product, but internally has four distinct subdomains:

### A. ORIGINATION ENGINE (PRIMARY)
**Purpose:** Create financeable loan products.
**Responsibilities:**
- Define loan types
- Price risk
- Set LTV thresholds
- Generate loan terms
- Bind loan to asset_id(s)

### B. DISTRIBUTION ENGINE (MARKETPLACE)
**Purpose:** Sell loans to capital providers.
**Responsibilities:**
- Publish loan opportunities
- Provide collateral transparency
- Track investor commitments
- Manage note ownership

### C. COVENANT MONITOR (LEDGER-DRIVEN)
**Purpose:** Protect lenders before losses occur.
**Responsibilities:**
- Monitor Ledger events
- Detect covenant breaches
- Trigger warnings or freezes
- Escalate to ClaimsIQ when necessary

**Examples:** Seal broken, Missed service interval, Custody violation.

### D. SETTLEMENT & RECOVERY (SUPPORTING)
**Purpose:** Handle adverse outcomes.
**Includes:**
- Insurance payouts (ClaimsIQ)
- Principal recovery
- Liquidation routing (Bids)
- Loss attribution

**Important:** This is a defensive subsystem, not Capital’s identity.

## VII. WHY CLAIMSIQ & SETTLEMENT STILL MATTER

ClaimsIQ exists to:
- Process **Insurance Claims** for Home, Ops, and Properties users.
- Adjudicate damage, loss, and theft of physical assets.
- Enforce policy coverage and triggers.

**Clarification:** ClaimsIQ is the **Insurance Adjudication Layer**. Capital executes the **Settlement** (Payouts) resulting from those decisions.
