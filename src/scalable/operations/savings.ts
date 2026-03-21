export const OVERNIGHT_OVERVIEW = `
  query OvernightOverview($savingsAccountId: ID!, $accountId: ID!) {
    account(id: $accountId) {
      savingsAccount(id: $savingsAccountId) {
        id
        ... on OvernightSavingsAccount {
          totalAmount
          nextPayoutDate {
            time
          }
          depositInterestRate: interestRate
          interests {
            effectiveYearlyDepositInterestRate
            estimatedNextPayoutAmount
            currentAccruedAmount
          }
        }
      }
    }
  }
`;

export const OVERNIGHT_TRANSACTIONS = `
  query OvernightOverviewPageData(
    $savingsAccountId: ID!,
    $accountId: ID!,
    $recentTransactionsInput: SavingsAccountCashTransactionInput!
  ) {
    account(id: $accountId) {
      savingsAccount(id: $savingsAccountId) {
        id
        ... on OvernightSavingsAccount {
          moreTransactions(input: $recentTransactionsInput) {
            transactions {
              id
              type
              status
              description
              amount
              currency
              lastEventDateTime
              cashTransactionType
            }
          }
        }
      }
    }
  }
`;

export interface SavingsTransaction {
  id: string;
  type: string;
  status: string;
  description: string;
  amount: number;
  currency: string;
  lastEventDateTime: string;
  cashTransactionType: string;
}

export interface OvernightSavingsAccount {
  id: string;
  totalAmount?: number;
  nextPayoutDate?: { time: string };
  depositInterestRate?: number;
  interests?: {
    effectiveYearlyDepositInterestRate: number;
    estimatedNextPayoutAmount: number;
    currentAccruedAmount: number;
  };
  moreTransactions?: {
    transactions: SavingsTransaction[];
  };
}
