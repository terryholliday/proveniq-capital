
import fetch from 'node-fetch';
import { PayoutProcessor } from './payoutProcessor';
import { LedgerEvent } from './schema';

interface LedgerEventResponse {
    events: {
        event_id: string;
        event_type: string;
        payload: any;
    }[];
    next_cursor?: string;
}

export class CapitalLedgerListener {
    private readonly ledgerUrl: string;
    private readonly payoutProcessor: PayoutProcessor;
    private lastSeenEventId: string | undefined;
    private isRunning: boolean = false;
    private readonly pollIntervalMs: number = 2000;

    constructor(ledgerBaseUrl: string) {
        this.ledgerUrl = ledgerBaseUrl.replace(/\/$/, '');
        this.payoutProcessor = new PayoutProcessor();
    }

    public async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log(`[Capital] Starting Settlement Worker. Target: ${this.ledgerUrl}`);
        this.pollLoop();
    }

    public stop() {
        this.isRunning = false;
        console.log('[Capital] Stopping Settlement Worker.');
    }

    private async pollLoop() {
        while (this.isRunning) {
            try {
                await this.poll();
            } catch (error) {
                console.error('[Capital] Poll error:', error);
            }
            await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
        }
    }

    private async poll() {
        // 1. Read events
        // Filter: CLAIM_PAYOUT_AUTHORIZED
        const url = new URL(`${this.ledgerUrl}/api/v1/events`);
        if (this.lastSeenEventId) {
            url.searchParams.append('after', this.lastSeenEventId);
        }
        url.searchParams.append('types', 'CLAIM_PAYOUT_AUTHORIZED');

        const response = await fetch(url.toString());
        if (!response.ok) {
            console.warn(`[Capital] Ledger poll failed: ${response.status}`);
            return;
        }

        const data = await response.json() as LedgerEventResponse;
        const events = data.events || [];

        for (const event of events) {
            this.lastSeenEventId = event.event_id;

            if (event.event_type === 'CLAIM_PAYOUT_AUTHORIZED') {
                console.log(`[Capital] Detected Authorization: ${event.event_id}`);
                await this.processAuthorization(event.event_id, event.payload);
            }
        }
    }

    private async processAuthorization(authEventId: string, payload: any) {
        const { claim_id, amount_micros, currency } = payload;

        if (!claim_id || !amount_micros || !currency) {
            console.warn(`[Capital] Invalid payload in ${authEventId}. Skipping.`);
            return;
        }

        // 2. Idempotency Gate
        // Query Ledger history for CAPITAL_PAYOUT_EXECUTED for same claim_id
        const exists = await this.checkEventExists('CAPITAL_PAYOUT_EXECUTED', claim_id);
        if (exists) {
            console.log(`[Capital] Payout for ${claim_id} already executed. Skipping.`);
            return;
        }

        // 3. Execute Payout
        const result = await this.payoutProcessor.processPayout(claim_id, amount_micros, currency, authEventId);

        // 4. Write Result
        if (result.success && result.txn_ref) {
            await this.writeEvent('CAPITAL_PAYOUT_EXECUTED', {
                claim_id: claim_id,
                amount_micros: amount_micros,
                currency: currency,
                txn_ref: result.txn_ref,
            });
        } else {
            await this.writeEvent('CAPITAL_PAYOUT_FAILED', {
                claim_id: claim_id,
                amount_micros: amount_micros,
                currency: currency,
                failure_code: result.failure_code || 'UNKNOWN',
                failure_reason: result.failure_reason || 'Unknown error',
            });
        }
    }

    private async checkEventExists(eventType: string, claimId: string): Promise<boolean> {
        const url = `${this.ledgerUrl}/api/v1/events/by-subject/${claimId}`;
        const response = await fetch(url);
        if (!response.ok) return false;

        const data = await response.json() as LedgerEventResponse;
        return data.events.some(e => e.event_type === eventType);
    }

    private async writeEvent(eventType: string, payload: any) {
        console.log(`[Capital] Writing ${eventType}...`);

        // Deterministic Idempotency Key
        // rule: idem:CAPITAL_PAYOUT_EXECUTED:${claim_id}
        const claimId = payload.claim_id;
        const idempotencyKey = `idem:${eventType}:${claimId}`;

        const envelope = {
            event_type: eventType,
            schema_version: "1.0.0",
            correlation_id: claimId,
            idempotency_key: idempotencyKey,
            occurred_at: new Date().toISOString(),
            producer: "proveniq-capital-worker",
            producer_version: "1.0.0",
            subject: claimId,
            payload: payload
        };

        const response = await fetch(`${this.ledgerUrl}/api/v1/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(envelope)
        });

        if (!response.ok) {
            const txt = await response.text();
            console.error(`[Capital] Failed to write ${eventType}: ${txt}`);
            throw new Error(`Failed to write ${eventType}`);
        }
    }
}

export async function startCapitalWorker() {
    const ledgerUrl = process.env.LEDGER_API_URL || 'http://localhost:3000';
    const listener = new CapitalLedgerListener(ledgerUrl);
    await listener.start();
}
