/**
 * Proveniq Capital - ClaimsIQ Integration Types
 * Synced with ClaimsIQ DecisionRecord schema
 */

export type ClaimVerdict = 'PAY' | 'DENY' | 'REVIEW' | 'PENDING';

export interface ClaimsIQDecisionRecord {
  id: string;                    // Decision UUID
  claim_id: string;              // Original claim ID
  policy_id: string;             // Policy reference
  status: ClaimVerdict;
  amount_approved: bigint;       // In cents
  currency: 'USD' | 'USDC';
  recipient_did: string;
  recipient_payout_address: string;
  decision_timestamp: Date;
  audit_seal: ClaimsIQAuditSeal;
  metadata?: Record<string, unknown>;
}

export interface ClaimsIQAuditSeal {
  signature: string;             // Cryptographic signature
  signer_id: string;             // ClaimsIQ system ID
  algorithm: 'ED25519' | 'ECDSA';
  timestamp: Date;
  hash: string;                  // SHA-256 of decision payload
}

export interface ClaimsIQPollResponse {
  decisions: ClaimsIQDecisionRecord[];
  cursor: string | null;         // For pagination
  has_more: boolean;
}

export interface ClaimsIQWebhookPayload {
  event_type: 'DECISION_ISSUED';
  decision: ClaimsIQDecisionRecord;
  webhook_id: string;
  timestamp: Date;
  signature: string;             // HMAC signature for verification
}

// Verification result
export interface SealVerificationResult {
  valid: boolean;
  signer_verified: boolean;
  timestamp_valid: boolean;
  hash_match: boolean;
  error?: string;
}
