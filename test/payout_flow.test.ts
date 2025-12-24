
import { processPayout } from '../src/workers/payoutProcessor';
import { ClaimPayoutAuthorizedEvent } from '../src/workers/schema';
import { describe, it, expect } from '@jest/globals';

describe('Payout Flow', () => {
    it('should generate valid payout result from authorized event', async () => {
        const mockEvent: ClaimPayoutAuthorizedEvent = {
            schema_version: "1.0.0",
            created_at: new Date().toISOString(),
            correlation_id: "claim_123",
            idempotency_key: "idem_123",
            event_type: "CLAIM_PAYOUT_AUTHORIZED",
            payload: {
                claim_id: "claim_test_123",
                amount_micros: "5000",
                currency: "USD",
                authorized_by_event_id: "auth_event_abc_123_xyz"
            }
        };

        const result = await processPayout(mockEvent);

        expect(result.success).toBe(true);
        expect(result.txn_ref).toMatch(/^txn_claim_test_123_/);
        expect(result.txn_ref).toContain("auth_eve"); // slice(0,8) of auth_event_abc...
    });
});
