/**
 * @file modules/underwriting/engine.test.ts
 * @description Underwriting Engine Tests with Mock Data
 * 
 * Tests various loan scenarios to validate underwriting logic:
 * - Low risk approvals
 * - High risk declines
 * - Conditional approvals
 * - Manual review triggers
 * - Edge cases
 */

import { getUnderwritingEngine, UnderwritingInput, UnderwritingResult } from './engine';

const engine = getUnderwritingEngine();

// ============================================
// MOCK DATA GENERATORS
// ============================================

function createMockBorrower(overrides: Partial<UnderwritingInput['borrowerData']> = {}): UnderwritingInput['borrowerData'] {
  return {
    creditScore: 720,
    monthlyIncomeCents: 500000, // $5,000/month
    existingDebtCents: 100000,  // $1,000 existing debt
    accountAgeDays: 730,        // 2 years
    previousLoansCount: 2,
    previousDefaultsCount: 0,
    ...overrides,
  };
}

function createMockCollateral(overrides: Partial<UnderwritingInput['collateral'][0]> = {}): UnderwritingInput['collateral'][0] {
  return {
    assetId: `ASSET-${Math.random().toString(36).substr(2, 8)}`,
    paid: `PAID-${Math.random().toString(36).substr(2, 8)}`,
    category: 'jewelry',
    estimatedValueCents: 1000000, // $10,000
    coreValuationCents: 950000,   // $9,500 Core valuation
    valuationConfidence: 'HIGH',
    provenanceScore: 85,
    ownershipVerified: true,
    condition: 'excellent',
    anchorBound: true,
    anchorType: 'smarttag',
    ...overrides,
  };
}

function createMockInput(overrides: Partial<UnderwritingInput> = {}): UnderwritingInput {
  return {
    borrowerId: `BOR-${Math.random().toString(36).substr(2, 8)}`,
    requestedAmountCents: 500000, // $5,000
    requestedTermDays: 180,
    purpose: 'personal',
    collateral: [createMockCollateral()],
    borrowerData: createMockBorrower(),
    ...overrides,
  };
}

// ============================================
// TEST SCENARIOS
// ============================================

interface TestScenario {
  name: string;
  input: UnderwritingInput;
  expectedDecision: UnderwritingResult['decision'];
  expectedRiskTier?: UnderwritingResult['riskTier'];
  expectedLtvRange?: { min: number; max: number };
  expectedAprRange?: { min: number; max: number };
}

const testScenarios: TestScenario[] = [
  // APPROVAL SCENARIOS
  {
    name: 'Low Risk - Prime Borrower with High-Value Collateral',
    input: createMockInput({
      requestedAmountCents: 300000, // $3,000
      collateral: [createMockCollateral({
        estimatedValueCents: 1500000,
        coreValuationCents: 1500000,
        provenanceScore: 95,
      })],
      borrowerData: createMockBorrower({
        creditScore: 780,
        previousLoansCount: 5,
        previousDefaultsCount: 0,
      }),
    }),
    expectedDecision: 'APPROVED',
    expectedRiskTier: 'low',
    expectedLtvRange: { min: 15, max: 25 },
    expectedAprRange: { min: 10, max: 18 },
  },
  {
    name: 'Medium Risk - Average Borrower with Good Collateral',
    input: createMockInput({
      requestedAmountCents: 400000, // $4,000
      collateral: [createMockCollateral({
        estimatedValueCents: 800000,
        coreValuationCents: 750000,
        valuationConfidence: 'MEDIUM',
        provenanceScore: 70,
      })],
      borrowerData: createMockBorrower({
        creditScore: 680,
        previousLoansCount: 1,
      }),
    }),
    expectedDecision: 'APPROVED',
    expectedRiskTier: 'medium',
    expectedLtvRange: { min: 45, max: 60 },
  },
  {
    name: 'Jewelry Collateral - Lower Risk Category',
    input: createMockInput({
      collateral: [createMockCollateral({
        category: 'jewelry',
        estimatedValueCents: 2000000,
        coreValuationCents: 1900000,
      })],
    }),
    expectedDecision: 'APPROVED',
    expectedRiskTier: 'low',
  },

  // CONDITIONAL APPROVAL SCENARIOS
  {
    name: 'High LTV - Requires Anchor',
    input: createMockInput({
      requestedAmountCents: 600000, // $6,000
      collateral: [createMockCollateral({
        estimatedValueCents: 800000,
        coreValuationCents: 800000,
        anchorBound: false,
      })],
    }),
    expectedDecision: 'CONDITIONALLY_APPROVED',
    expectedLtvRange: { min: 70, max: 80 },
  },
  {
    name: 'Unanchored High-Value Loan',
    input: createMockInput({
      requestedAmountCents: 700000, // $7,000
      collateral: [createMockCollateral({
        estimatedValueCents: 1500000,
        anchorBound: false,
      })],
    }),
    expectedDecision: 'CONDITIONALLY_APPROVED',
  },

  // MANUAL REVIEW SCENARIOS
  {
    name: 'Borderline Risk Metrics',
    input: createMockInput({
      requestedAmountCents: 500000,
      collateral: [createMockCollateral({
        estimatedValueCents: 750000,
        coreValuationCents: 700000,
        valuationConfidence: 'LOW',
        provenanceScore: 50,
        condition: 'fair',
      })],
      borrowerData: createMockBorrower({
        creditScore: 620,
        previousDefaultsCount: 1,
      }),
    }),
    expectedDecision: 'MANUAL_REVIEW',
  },

  // DECLINE SCENARIOS
  {
    name: 'LTV Over 85% - Auto Decline',
    input: createMockInput({
      requestedAmountCents: 900000, // $9,000
      collateral: [createMockCollateral({
        estimatedValueCents: 1000000,
        coreValuationCents: 1000000,
      })],
    }),
    expectedDecision: 'DECLINED',
  },
  {
    name: 'No Collateral - Auto Decline',
    input: createMockInput({
      collateral: [],
    }),
    expectedDecision: 'DECLINED',
  },
  {
    name: 'No Verified Ownership - Auto Decline',
    input: createMockInput({
      collateral: [createMockCollateral({
        ownershipVerified: false,
      })],
    }),
    expectedDecision: 'DECLINED',
  },
  {
    name: 'High Risk Borrower with Poor Collateral',
    input: createMockInput({
      collateral: [createMockCollateral({
        valuationConfidence: 'LOW',
        provenanceScore: 20,
        condition: 'poor',
        category: 'other',
        anchorBound: false,
      })],
      borrowerData: createMockBorrower({
        creditScore: 520,
        previousDefaultsCount: 3,
        accountAgeDays: 30,
      }),
    }),
    expectedDecision: 'DECLINED',
  },

  // EDGE CASES
  {
    name: 'Multiple Collateral Items',
    input: createMockInput({
      requestedAmountCents: 800000, // $8,000
      collateral: [
        createMockCollateral({
          category: 'jewelry',
          estimatedValueCents: 500000,
          coreValuationCents: 480000,
        }),
        createMockCollateral({
          category: 'electronics',
          estimatedValueCents: 300000,
          coreValuationCents: 250000,
        }),
        createMockCollateral({
          category: 'art',
          estimatedValueCents: 700000,
          coreValuationCents: 650000,
        }),
      ],
    }),
    expectedDecision: 'APPROVED',
    expectedLtvRange: { min: 50, max: 65 },
  },
  {
    name: 'Long Term Loan (1 Year)',
    input: createMockInput({
      requestedTermDays: 365,
      requestedAmountCents: 300000,
      collateral: [createMockCollateral({
        estimatedValueCents: 1000000,
      })],
    }),
    expectedDecision: 'APPROVED',
    expectedAprRange: { min: 14, max: 22 },
  },
  {
    name: 'No Borrower Data - Default Scoring',
    input: createMockInput({
      borrowerData: undefined,
      requestedAmountCents: 300000,
      collateral: [createMockCollateral({
        estimatedValueCents: 1000000,
      })],
    }),
    expectedDecision: 'APPROVED',
  },
  {
    name: 'Electronics - Higher Risk Category',
    input: createMockInput({
      collateral: [createMockCollateral({
        category: 'electronics',
        estimatedValueCents: 1000000,
        coreValuationCents: 800000, // 20% depreciation applied
      })],
    }),
    expectedDecision: 'APPROVED',
    expectedRiskTier: 'medium',
  },
];

// ============================================
// TEST RUNNER
// ============================================

async function runTests(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  PROVENIQ CAPITAL - UNDERWRITING ENGINE TESTS');
  console.log('='.repeat(60));
  console.log('');

  let passed = 0;
  let failed = 0;
  const failures: { name: string; expected: string; actual: string; details: string }[] = [];

  for (const scenario of testScenarios) {
    try {
      const result = await engine.underwrite(scenario.input);
      
      let scenarioPassed = true;
      let failureDetails: string[] = [];

      // Check decision
      if (result.decision !== scenario.expectedDecision) {
        scenarioPassed = false;
        failureDetails.push(`Decision: expected ${scenario.expectedDecision}, got ${result.decision}`);
      }

      // Check risk tier if specified
      if (scenario.expectedRiskTier && result.riskTier !== scenario.expectedRiskTier) {
        scenarioPassed = false;
        failureDetails.push(`Risk Tier: expected ${scenario.expectedRiskTier}, got ${result.riskTier}`);
      }

      // Check LTV range if specified
      if (scenario.expectedLtvRange) {
        if (result.ltv < scenario.expectedLtvRange.min || result.ltv > scenario.expectedLtvRange.max) {
          scenarioPassed = false;
          failureDetails.push(`LTV: expected ${scenario.expectedLtvRange.min}-${scenario.expectedLtvRange.max}%, got ${result.ltv}%`);
        }
      }

      // Check APR range if specified
      if (scenario.expectedAprRange && result.aprPercent) {
        if (result.aprPercent < scenario.expectedAprRange.min || result.aprPercent > scenario.expectedAprRange.max) {
          scenarioPassed = false;
          failureDetails.push(`APR: expected ${scenario.expectedAprRange.min}-${scenario.expectedAprRange.max}%, got ${result.aprPercent}%`);
        }
      }

      if (scenarioPassed) {
        console.log(`✅ PASS: ${scenario.name}`);
        console.log(`   Decision: ${result.decision} | Risk: ${result.riskTier} | LTV: ${result.ltv}% | Score: ${result.combinedRiskScore}`);
        passed++;
      } else {
        console.log(`❌ FAIL: ${scenario.name}`);
        for (const detail of failureDetails) {
          console.log(`   ${detail}`);
        }
        failed++;
        failures.push({
          name: scenario.name,
          expected: scenario.expectedDecision,
          actual: result.decision,
          details: failureDetails.join('; '),
        });
      }
    } catch (error: any) {
      console.log(`❌ ERROR: ${scenario.name}`);
      console.log(`   ${error.message}`);
      failed++;
      failures.push({
        name: scenario.name,
        expected: scenario.expectedDecision,
        actual: 'ERROR',
        details: error.message,
      });
    }
    console.log('');
  }

  // Summary
  console.log('='.repeat(60));
  console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${testScenarios.length} total`);
  console.log('='.repeat(60));

  if (failures.length > 0) {
    console.log('\nFailed Tests:');
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.details}`);
    }
  }

  console.log('\n');
}

// Run tests if executed directly
runTests().catch(console.error);

export { runTests, testScenarios };
