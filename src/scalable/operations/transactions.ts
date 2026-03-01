export const MORE_TRANSACTIONS = `
  query moreTransactions($personId: ID!, $input: BrokerTransactionInput!, $portfolioId: ID!) {
    account(id: $personId) {
      id
      brokerPortfolio(id: $portfolioId) {
        id
        moreTransactions(input: $input) {
          ...MoreTransactionsFragment
          __typename
        }
        __typename
      }
      __typename
    }
  }

  fragment MoreTransactionsFragment on BrokerTransactionSummaries {
    cursor
    total
    transactions {
      id
      currency
      type
      status
      isCancellation
      lastEventDateTime
      description
      ...BrokerCashTransactionSummaryFragment
      ...BrokerNonTradeSecurityTransactionSummaryFragment
      ...BrokerSecurityTransactionSummaryFragment
      ...BrokerEltifTransactionSummaryFragment
      __typename
    }
    __typename
  }

  fragment BrokerCashTransactionSummaryFragment on BrokerCashTransactionSummary {
    cashTransactionType
    amount
    relatedIsin
    __typename
  }

  fragment BrokerNonTradeSecurityTransactionSummaryFragment on BrokerNonTradeSecurityTransactionSummary {
    nonTradeSecurityTransactionType
    quantity
    amount
    isin
    __typename
  }

  fragment BrokerSecurityTransactionSummaryFragment on BrokerSecurityTransactionSummary {
    securityTransactionType
    quantity
    amount
    side
    isin
    __typename
  }

  fragment BrokerEltifTransactionSummaryFragment on BrokerEltifTransactionSummary {
    amount
    eltifQuantity
    isin
    securityTransactionType
    side
    __typename
  }
`;
