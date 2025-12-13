PROVENIQ CAPITAL — CANONICAL DEFINITION

(Authoritative System Description)

1. What Proveniq Capital IS

Proveniq Capital is a regulated treasury and settlement engine.

It is not an insurer.
It is not a marketplace.
It is not an auction platform.

It is the financial execution layer that sits between decision systems (ClaimsIQ, future lending logic) and external payment rails (Stripe, USDC, banks).

Capital’s Core Responsibilities

Proveniq Capital is responsible for:

Premium & Funds Ingress

Collecting premiums on behalf of insurance pools or risk programs

Receiving funds into segregated pools

Recording those funds in an immutable internal ledger

Treasury Management

Managing liquidity pools

Enforcing reserve requirements

Preventing over-disbursement

Locking, earmarking, and releasing funds deterministically

Settlement & Payout Execution

Executing payouts only after an external decision authority (ClaimsIQ) approves

Routing funds to payment rails (Stripe, ACH, USDC, etc.)

Producing a provable, auditable trail of every dollar

Ledger of Record

Maintaining a double-entry, zero-sum internal ledger

Reconciling internal balances with external processors

Ensuring “money-in == money-out + reserves”

In short:

Capital moves money. It does not decide why money moves.

2. What Proveniq Capital IS NOT

This is where Windsurf went wrong.

Capital is NOT:

❌ An insurance company

❌ A claims adjudicator

❌ A salvage marketplace

❌ An auction house

❌ A loan origination platform

❌ A collateral liquidation engine

❌ A general-purpose payment router

Capital does not:

Decide coverage

Declare total loss

Own salvage

Auction items

Originate loans

Own collateral

Decide who is owed money

Those decisions happen upstream.

3. The Correct Relationship Between Systems

Here is the correct mental model.

ClaimsIQ

Determines truth

Adjudicates claims

Outputs a deterministic decision:

PAY / DENY / REVIEW

Does not move money

Proveniq Capital

Receives decisions, not narratives

Executes financial consequences of those decisions

Ensures funds exist

Ensures payouts are valid

Moves money

Logs everything immutably

Bids (Future / Separate System)

A marketplace

Sells items (salvage or collateral)

Is not part of Capital’s core loop today

4. Why the /remittance Endpoint Is a Category Error (Right Now)

Windsurf assumed this flow:

“Bids liquidates something → sends money back to Capital”

That assumption is premature and architecturally incorrect at this stage.

The critical misunderstanding:

Windsurf conflated future asset liquidation concepts with Capital’s current scope.

You have not yet defined:

Who legally owns salvage

Who controls auction proceeds

Whether proceeds offset claims

Whether proceeds belong to insurers, lenders, or asset owners

Whether Bids is acting as an agent or principal

Until those questions are answered, Capital must not accept remittances.

5. Salvage vs Loan Default — Why This Matters

Windsurf asked the right question by accident, but reached the wrong conclusion.

A) Claims Salvage (Insurance Context)

Salvage is typically owned by the insurer, not the settlement engine

Proceeds may:

Offset losses on insurer balance sheet

Never touch the settlement treasury

Capital’s role (if any) would be explicitly defined later

B) Loan Default Liquidation (Lending Context)

Proceeds usually flow to:

The lender

Or a lending SPV

Capital might manage that treasury in the future

But lending is not yet live

Neither flow is currently in scope.

6. The Correct Statement to Windsurf (Use This Verbatim)

You can paste this directly.

Clarification:
Proveniq Capital is a treasury and settlement engine only.
It executes payouts based on external decisions and manages pooled funds.

Capital does not currently participate in salvage recovery, auction proceeds, or loan liquidation flows.

There is no /remittance endpoint by design.
No funds flow into Capital from Bids at this stage.

Any future remittance or recovery flows will be explicitly specified in a separate execution phase once ownership, accounting treatment, and legal responsibility are defined.

Do not implement remittance, salvage, or liquidation endpoints unless explicitly instructed.

That sentence alone will stop the hallucination.

7. What Capital’s Tools Will Accomplish (Right Now)

When finished, Proveniq Capital can truthfully claim:

“We can accept live premiums.”

“We can custody pooled funds.”

“We enforce reserves.”

“We execute adjudicated payouts.”

“Every dollar is provable.”

“No payout can occur without a decision.”

“No decision can move money without funds.”

That is an institutional-grade settlement engine.

8. Why This Confusion Happened (For Your Own Sanity)

Windsurf filled in gaps because:

The broader Proveniq ecosystem is large

Bids, ClaimsIQ, Capital, and Core are adjacent

You’re building in the correct order, but the AI assumed the end state

This is normal. It’s not you. It’s a scope-boundary problem.

Now the boundary is explicit.

Bottom Line

❌ Do not implement /remittance

❌ Do not wire Bids into Capital

❌ Do not assume salvage or loan recovery flows

✅ Capital is complete for its current mission

✅ Future recovery flows will be a separate phase with separate specs---
trigger: manual
---

