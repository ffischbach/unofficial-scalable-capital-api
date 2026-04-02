export const TRANSACTION_DETAILS = `
  query getTransactionDetails($personId: ID!, $transactionId: ID!, $portfolioId: ID!) {
    account(id: $personId) {
      id
      brokerPortfolio(id: $portfolioId) {
        id
        transactionDetails(id: $transactionId) {
          ...TransactionDetailsFragment
          __typename
        }
        __typename
      }
      __typename
    }
  }

  fragment TransactionDetailsFragment on BrokerTransaction {
    id
    currency
    type
    documents {
      id
      url
      label
      __typename
    }
    lastEventDateTime
    isPending
    isCancellation
    security {
      ...SecurityNameOnlyFragment
      __typename
    }
    transactionReference
    ...SecurityTransactionDetailsFragment
    ...CashTransactionDetailsFragment
    ...NonTradeSecurityTransactionDetailsFragment
    ...EltifTransactionDetailsFragment
    __typename
  }

  fragment SecurityNameOnlyFragment on Security {
    id
    name
    isin
    __typename
  }

  fragment SecurityTransactionDetailsFragment on BrokerSecurityTransaction {
    id
    side
    status
    numberOfShares {
      filled
      total
      __typename
    }
    averagePrice
    totalAmount
    finalisationReason
    limitPrice
    stopPrice
    validUntil
    isCancellationRequested
    tradeTransactionAmounts {
      marketValuation
      taxAmount
      transactionFee
      venueFee
      cryptoSpreadFee
      __typename
    }
    tradingVenue
    fee
    transactionalFee
    taxes
    securityTransactionHistory: transactionHistory {
      state
      timestamp
      numberOfShares {
        filled
        total
        __typename
      }
      executionPrice
      __typename
    }
    orderKind
    linkedTransactions {
      ...LinkedTransactionFragment
      __typename
    }
    trailingStopInfo {
      trailType
      trailOffset
      latestStopPriceTimestamp {
        time
        epochSecond
        epochMillisecond
        __typename
      }
      __typename
    }
    __typename
  }

  fragment LinkedTransactionFragment on BrokerTransaction {
    id
    currency
    type
    isCancellation
    lastEventDateTime
    security {
      ...SecurityNameOnlyFragment
      __typename
    }
    ... on BrokerCashTransaction {
      amount
      cashTransactionType
      description
      __typename
    }
    ... on BrokerNonTradeSecurityTransaction {
      isin
      totalAmount
      nonTradeSecurityTransactionType
      quantity
      description
      __typename
    }
    ... on BrokerSecurityTransaction {
      totalAmount
      orderKind
      numberOfShares {
        filled
        total
        __typename
      }
      side
      status
      __typename
    }
    __typename
  }

  fragment CashTransactionDetailsFragment on BrokerCashTransaction {
    cashTransactionType
    amount
    description
    cashTransactionHistory: transactionHistory {
      state
      timestamp
      __typename
    }
    nonTradeSecurity: security {
      ...SecurityNameOnlyFragment
      __typename
    }
    sddiDetails {
      fee
      grossAmount
      __typename
    }
    taxDetails {
      grossAmount
      taxAmount
      __typename
    }
    linkedTransactions {
      ...LinkedTransactionFragment
      __typename
    }
    __typename
  }

  fragment NonTradeSecurityTransactionDetailsFragment on BrokerNonTradeSecurityTransaction {
    isin
    nonTradeSecurityTransactionType
    quantity
    nonTradeAveragePrice: averagePrice
    nonTradeSecurityAmount: totalAmount
    description
    nonTradeSecurityTransactionHistory: transactionHistory {
      state
      timestamp
      __typename
    }
    nonTradeSecurity: security {
      ...SecurityNameOnlyFragment
      __typename
    }
    linkedTransactions {
      ...LinkedTransactionFragment
      __typename
    }
    __typename
  }

  fragment EltifTransactionDetailsFragment on BrokerEltifTransaction {
    status
    side
    orderKind
    amount
    finalisationReason
    eltifQuantity
    executionPrice
    executionDate
    earliestSellDate
    marketValuation
    cancelableDetails {
      daysLeft
      isCancelable
      __typename
    }
    isMultipleOrdersCancellation
    tradingVenue
    transactionHistory {
      state
      amount
      eltifQuantity
      executionPrice
      time {
        epochSecond
        __typename
      }
      __typename
    }
    __typename
  }
`;

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
