
import { z } from 'zod';

export const IntStringSchema = z.string().regex(/^-?\d+$/);

export const CapitalPayoutExecutedEventSchema = z.object({
    event_type: z.literal("CAPITAL_PAYOUT_EXECUTED"),
    schema_version: z.string(),
    correlation_id: z.string(),
    idempotency_key: z.string(),
    occurred_at: z.string(),
    producer: z.string(),
    producer_version: z.string(),
    subject: z.string(),
    payload: z.object({
        claim_id: z.string().regex(/^claim_[a-zA-Z0-9-]+$/),
        amount_micros: IntStringSchema,
        currency: z.string().length(3),
        txn_ref: z.string(),
    }),
});

export const CapitalPayoutFailedEventSchema = z.object({
    event_type: z.literal("CAPITAL_PAYOUT_FAILED"),
    schema_version: z.string(),
    correlation_id: z.string(),
    idempotency_key: z.string(),
    occurred_at: z.string(),
    producer: z.string(),
    producer_version: z.string(),
    subject: z.string(),
    payload: z.object({
        claim_id: z.string().regex(/^claim_[a-zA-Z0-9-]+$/),
        amount_micros: IntStringSchema,
        currency: z.string().length(3),
        failure_code: z.string(),
        failure_reason: z.string(),
    }),
});

export const LedgerEventSchema = z.discriminatedUnion("event_type", [
    CapitalPayoutExecutedEventSchema,
    CapitalPayoutFailedEventSchema,
    // Capital listens for this:
    z.object({
        event_type: z.literal("CLAIM_PAYOUT_AUTHORIZED"),
        payload: z.object({
            claim_id: z.string(),
            amount_micros: z.string(),
            currency: z.string(),
            authorized_by_event_id: z.string(),
        })
    }).passthrough(),
]);

export type LedgerEvent = z.infer<typeof LedgerEventSchema>;
