
import { getLedgerClient } from '../shared/ledger-client'; // Assumed path
import { getDb } from '../database'; // Assumed path

export class LedgerListener {
    private isRunning = false;
    private lastSequenceProcessed = 0;

    async start() {
        this.isRunning = true;
        this.poll();
    }

    async stop() {
        this.isRunning = false;
    }

    private async poll() {
        if (!this.isRunning) return;

        try {
            const client = getLedgerClient();
            // Poll for authorized payouts since last sequence
            const events = await client.queryEvents({
                eventType: 'CLAIM_PAYOUT_AUTHORIZED', // Or CLAIM_DECISION_RECORDED with PAY
                fromSequence: this.lastSequenceProcessed + 1,
                limit: 10
            });

            for (const event of events) {
                await this.processEvent(event);
                this.lastSequenceProcessed = Math.max(this.lastSequenceProcessed, event.sequence);
            }

        } catch (error) {
            console.error('[LEDGER LISTENER] Poll failed:', error);
        }

        // Schedule next poll
        if (this.isRunning) {
            setTimeout(() => this.poll(), 5000); // 5 sec poll
        }
    }

    async processEvent(event: any) {
        console.log(`[LEDGER LISTENER] Processing Event ${event.id} type ${event.eventType}`);

        // 1. Idempotency Check (Local DB)
        const db = getDb();
        const existing = await db.payouts.findFirst({ where: { ledgerEventId: event.id } });
        if (existing) {
            console.log(`[LEDGER LISTENER] Event ${event.id} already processed. Skipping.`);
            return;
        }

        // 2. Execute Payout logic (Stripe/Bank)
        // This is THE ONLY PLACE money moves.
        const payoutId = `payout-${Date.now()}`; // Mock execution
        console.log(`[CAPITAL] EXECUTING PAYOUT for Claim ${event.subject?.claim_id}`);

        // 3. Write Consequence to Ledger
        const client = getLedgerClient();
        await client.writeEvent(
            'CAPITAL_PAYOUT_EXECUTED',
            'capital',
            event.subject.asset_id, // or claim_id
            {
                originalEventId: event.id,
                amount: event.payload.amount,
                currency: event.payload.currency,
                payoutId: payoutId
            },
            event.correlation_id
        );
    }
}
