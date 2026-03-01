export const GET_PORTFOLIO_GROUPS_INVENTORY = `
  query getPortfolioGroupsInventory($personId: ID!, $portfolioId: ID!) {
    account(id: $personId) {
      id
      brokerPortfolio(id: $portfolioId) {
        ...PortfolioGroupsInventoryFragment
        __typename
      }
      __typename
    }
  }

  fragment PortfolioGroupsInventoryFragment on BrokerPortfolio {
    id
    inventory {
      id
      portfolioGroups {
        id
        maxPortfolioGroupsPerPortfolioReached
        offerAllowsAdditionalPortfolioGroup
        items {
          id
          details {
            id
            name
            description
            __typename
          }
          items {
            ...SecurityInfoFragment
            ...SecurityQuoteTick
            __typename
          }
          numberOfPendingOrders
          savingsPlansAmount
          performance {
            id
            valuation
            performancesByTimeframe {
              performance
              simpleAbsoluteReturn
              timeframe
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
      ungroupedInventoryItems {
        id
        items {
          ...SecurityInfoFragment
          ...SecurityQuoteTick
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }

  fragment SecurityInfoFragment on Security {
    id
    isin
    wkn
    name
    type
    isSustainable
    isOnWatchlist
    numberOfPendingOrders
    inventory {
      id
      ...SavingsPlanFragment
      ...PositionFragment
      __typename
    }
    partnerType
    reimbursedFor
    __typename
  }

  fragment SavingsPlanFragment on InventoryItem {
    savingsPlan {
      isin
      amount
      dayOfTheMonth
      dynamizationRate
      frequency
      paymentMethod
      nextExecutionDate {
        date
        __typename
      }
      __typename
    }
    __typename
  }

  fragment PositionFragment on InventoryItem {
    position {
      filled
      blocked
      pending
      sellableByVenue {
        venue
        sellable
        __typename
      }
      fifoPrice
      __typename
    }
    __typename
  }

  fragment SecurityQuoteTick on Security {
    quoteTick {
      ...QuoteTickFragment
      __typename
    }
    __typename
  }

  fragment QuoteTickFragment on QuoteTick {
    id
    isin
    midPrice
    time
    currency
    bidPrice
    askPrice
    isOutdated
    timestampUtc {
      time
      epochMillisecond
      __typename
    }
    performanceDate {
      date
      __typename
    }
    performancesByTimeframe {
      timeframe
      performance
      simpleAbsoluteReturn
      __typename
    }
    __typename
  }
`;

export const GET_SUSPENSE_WATCHLIST = `
  query getSuspenseWatchlist($personId: ID!, $portfolioId: ID!) {
    account(id: $personId) {
      id
      brokerPortfolio(id: $portfolioId) {
        id
        ...WatchlistOnBrokerPortfolioFragment
        __typename
      }
      __typename
    }
  }

  fragment WatchlistOnBrokerPortfolioFragment on BrokerPortfolio {
    watchlist {
      id
      items {
        ...SecurityInfoFragment
        ...SecurityQuoteTick
        __typename
      }
      __typename
    }
    __typename
  }

  fragment SecurityInfoFragment on Security {
    id
    isin
    wkn
    name
    type
    isSustainable
    isOnWatchlist
    numberOfPendingOrders
    inventory {
      id
      ...SavingsPlanFragment
      ...PositionFragment
      __typename
    }
    partnerType
    reimbursedFor
    __typename
  }

  fragment SavingsPlanFragment on InventoryItem {
    savingsPlan {
      isin
      amount
      dayOfTheMonth
      dynamizationRate
      frequency
      paymentMethod
      nextExecutionDate {
        date
        __typename
      }
      __typename
    }
    __typename
  }

  fragment PositionFragment on InventoryItem {
    position {
      filled
      blocked
      pending
      sellableByVenue {
        venue
        sellable
        __typename
      }
      fifoPrice
      __typename
    }
    __typename
  }

  fragment SecurityQuoteTick on Security {
    quoteTick {
      ...QuoteTickFragment
      __typename
    }
    __typename
  }

  fragment QuoteTickFragment on QuoteTick {
    id
    isin
    midPrice
    time
    currency
    bidPrice
    askPrice
    isOutdated
    timestampUtc {
      time
      epochMillisecond
      __typename
    }
    performanceDate {
      date
      __typename
    }
    performancesByTimeframe {
      timeframe
      performance
      simpleAbsoluteReturn
      __typename
    }
    __typename
  }
`;

export const GET_CASH_BREAKDOWN = `
  query getCashBreakdown($personId: ID!, $portfolioId: ID!) {
    account(id: $personId) {
      id
      brokerPortfolio(id: $portfolioId) {
        id
        ...PaymentsOnBrokerPortfolioFragment
        __typename
      }
      __typename
    }
  }

  fragment PaymentsOnBrokerPortfolioFragment on BrokerPortfolio {
    payments {
      id
      buyingPower {
        id
        cashBalance
        liveLimit
        pendingBuyOrdersAmount
        pendingDividendsReinvestmentAmount
        pendingPocketMoneyAmount
        pendingSavingsPlanAmount
        pendingWithdrawalsAmount
        estimatedTaxes
        directDebit
        cashAvailableToInvest
        __typename
      }
      derivativesBuyingPower {
        id
        cashAvailableToInvest
        derivativesDirectDebit
        cashAvailableForDerivatives
        __typename
      }
      withdrawalPower {
        id
        cashAvailableToInvest
        sellTradesAmount
        withdrawalDirectDebit
        cashAvailableForWithdrawal
        __typename
      }
      __typename
    }
    __typename
  }
`;

export const GET_INTERESTS = `
  query getInterests($personId: ID!, $portfolioId: ID!) {
    account(id: $personId) {
      id
      brokerPortfolio(id: $portfolioId) {
        id
        interests {
          depositInterestRate
          effectiveYearlyDepositInterestRate
          grantedOverdraftInterestRate
          __typename
        }
        __typename
      }
      __typename
    }
  }
`;

export const QUERY_PENDING_ORDERS = `
  query queryPendingOrders($personId: ID!, $portfolioId: ID!) {
    account(id: $personId) {
      id
      brokerPortfolio(id: $portfolioId) {
        id
        numberOfPendingOrders
        __typename
      }
      __typename
    }
  }
`;

export const GET_APPROPRIATENESS_RESULT = `
  query getAppropriatenessResult($personId: ID!, $portfolioId: ID!) {
    account(id: $personId) {
      id
      brokerPortfolio(id: $portfolioId) {
        id
        appropriatenessInfo {
          id
          appropriatenessId
          result
          __typename
        }
        __typename
      }
      __typename
    }
  }
`;

export const GET_CRYPTO_PERFORMANCE = `
  query getCryptoPerformance($personId: ID!, $portfolioId: ID!) {
    account(id: $personId) {
      id
      brokerPortfolio(id: $portfolioId) {
        id
        valuation {
          id
          cryptoValuation
          cryptoUnrealisedReturnSinceBuy {
            absoluteUnrealisedReturn
            relativeUnrealisedReturn
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
  }
`;

export const TIME_WEIGHTED_RETURN = `
  query timeWeightedReturn($personId: ID!, $portfolioId: ID!, $includeYearToDate: Boolean) {
    account(id: $personId) {
      id
      brokerPortfolio(id: $portfolioId) {
        id
        timeseries(includeYearToDate: $includeYearToDate) {
          id
          timeframe
          closingReferencePoint {
            id
            absoluteReturn
            valuation
            timestampUtc {
              time
              __typename
            }
            __typename
          }
          dataPoints {
            id
            absoluteReturn
            valuation
            timestampUtc {
              time
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
  }
`;
