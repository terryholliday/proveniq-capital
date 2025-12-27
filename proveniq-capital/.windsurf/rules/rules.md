PROVENIQ CAPITAL — CANONICAL RULES OF OPERATION

(Foundational Contract — Version 1.0)

These rules define what flows are allowed to exist in the Proveniq ecosystem and which are forbidden until explicitly unlocked.

I. SYSTEM ROLE RULES
Rule 1 — Capital Is a Settlement Engine, Not a Decision Engine

Capital never decides:

Coverage

Eligibility

Fault

Valuation

Ownership

Capital only executes financial consequences of external decisions.

If a decision is not explicit and final, Capital must not move money.

Rule 2 — Capital Is Not an Insurer

Capital does not underwrite risk

Capital does not price policies

Capital does not pay claims “from its own balance sheet”

Capital does not own loss exposure

Capital acts on behalf of a pool or program, not as the risk bearer.

Rule 3 — Capital Is Not a Marketplace

Capital does not list assets

Capital does not sell assets

Capital does not auction assets

Capital does not discover prices

Any system that converts assets into cash is not Capital.

II. MONEY FLOW RULES (MOST IMPORTANT)
Rule 4 — Allowed Ingress Flows (Current Phase)

Capital may accept funds only from explicitly authorized ingress sources.

Allowed today:

Premium collection (Stripe test/live)

Explicit pool funding (admin-seeded)

Forbidden today:

Auction proceeds

Salvage recovery

Loan collateral liquidation

Third-party remittances of any kind

If the source of funds is ambiguous, Capital must reject the flow.

Rule 5 — Allowed Egress Flows (Current Phase)

Capital may disburse funds only when:

An external authority (ClaimsIQ) issues a final decision

Funds are available after reserve enforcement

The payout path is explicitly defined

Allowed today:

Claim payouts triggered by ClaimsIQ

Forbidden today:

Salvage refunds

Loan recovery redistribution

Cross-system settlement netting

Rule 6 — Capital Never Assumes Ownership of Assets

Capital does not own:

Insured items

Salvage

Collateral

Capital only owns ledger entries, not things

If ownership of an asset is unclear, Capital is out of scope.

III. LEDGER & ACCOUNTING RULES
Rule 7 — Ledger Is Canonical and Zero-Sum

Every transaction:

Must debit one account

Must credit another

No money is created or destroyed inside Capital

External balances must reconcile exactly

Rule 8 — Account Types Must Be Explicit

Capital accounts may exist only if explicitly defined.

Allowed account classes (v1):

Premium Pool

Reserve Pool

Pending Payout

Executed Payout

Disallowed (until defined):

Salvage Revenue

Loan Recovery

Asset Liquidation

Marketplace Proceeds

If an account type does not exist in the spec, it cannot be created in code.

IV. SYSTEM BOUNDARY RULES (THIS IS WHERE WINDSURF DRIFTED)
Rule 9 — Capital Does Not Pull Money Back In

Capital is not a return pipe.

There is no general “funds returning to Capital” concept in the current architecture.

Money enters Capital intentionally and leaves intentionally.
It does not boomerang.

Rule 10 — No /remittance Endpoint Exists by Default

A remittance endpoint is not assumed

It is not generic

It is not future-proof

It must be:

Narrowly scoped

Legally justified

Accounting-defined

Phase-approved

Until then:

❌ No /remittance

❌ No [Bids → Capital] money flow

V. CLAIMS SALVAGE RULES (PRE-DECLARATIVE)
Rule 11 — Salvage Is Not Automatically Capital’s Concern

Salvage is typically owned by:

Insurer

Policyholder

Third party

Not the settlement engine

If salvage exists:

Its liquidation is external

Its proceeds do not automatically offset claims

Its accounting treatment must be explicit

Rule 12 — ClaimsIQ Does Not Imply Salvage Routing

ClaimsIQ may declare “Total Loss”

That does not imply:

Auction

Sale

Recovery

Remittance

Those are separate legal workflows.

VI. LENDING & COLLATERAL RULES (FUTURE ONLY)
Rule 13 — Lending Is a Separate Phase

Loan origination is not live

Collateral liquidation is not live

Default recovery is not live

Any reference to loan liquidation is out of scope today.

Rule 14 — If Lending Comes Later, Treasury Rules Are Rewritten

If Capital ever manages a lending pool:

New account classes are required

Ownership rules must be explicit

Remittance may become valid only then

That is Phase X, not Phase Now.

VII. CHANGE CONTROL RULES
Rule 15 — New Money Flows Require a Rule Amendment

Before adding:

An endpoint

A ledger account

A money source

A money destination

You must first define:

Ownership

Legal authority

Accounting treatment

Failure modes

Audit implications

No exceptions.

VIII. THE META-RULE (FOR WINDSURF)
Rule 16 — Do Not Complete the Founder’s Vision Prematurely

If a flow is:

Implied

Logical

Obvious

“Eventually needed”

But not explicitly specified—

Do not build it.

ONE-SENTENCE SUMMARY (PIN THIS)

Proveniq Capital moves money only when told to, only from known sources, only to known destinations, and never assumes ownership or intent beyond the explicit instruction it receives.---
trigger: manual
---

