export const GET_SECURITY = `
  query getSecurity($personId: ID!, $isin: ID!, $portfolioId: ID!) {
    account(id: $personId) {
      id
      brokerPortfolio(id: $portfolioId) {
        id
        security(isin: $isin) {
          ...SecurityDetails
          ...SecurityQuoteTick
          __typename
        }
        __typename
      }
      __typename
    }
  }

  fragment SecurityDetails on Security {
    id
    isin
    wkn
    name
    type
    availabilityForSavingsPlans
    isOnWatchlist
    isSustainable
    numberOfPendingOrders
    inventory {
      id
      ...SavingsPlanFragment
      ...PositionFragment
      __typename
    }
    portfolioGroupDetails {
      id
      name
      __typename
    }
    partnerType
    buyTradability {
      id
      tradabilityStatus
      primaryVenue {
        venue
        status
        __typename
      }
      venues {
        venue
        tradabilityStatus
        unavailabilityReason
        __typename
      }
      __typename
    }
    sellTradability {
      id
      tradabilityStatus
      primaryVenue {
        venue
        status
        __typename
      }
      venues {
        venue
        tradabilityStatus
        unavailabilityReason
        __typename
      }
      __typename
    }
    buyTradabilityForTrading {
      id
      tradabilityStatus
      primaryVenue {
        venue
        status
        __typename
      }
      venues {
        venue
        tradabilityStatus
        unavailabilityReason
        __typename
      }
      __typename
    }
    sellTradabilityForTrading {
      id
      tradabilityStatus
      primaryVenue {
        venue
        status
        __typename
      }
      venues {
        venue
        tradabilityStatus
        unavailabilityReason
        __typename
      }
      __typename
    }
    transferAvailability {
      id
      isAvailable
      unavailabilityReason
      __typename
    }
    liquidityBand
    underlying {
      id
      isin
      __typename
    }
    derivativesInfo {
      id
      knockout {
        isKnocked
        __typename
      }
      expiry {
        id
        isExpired
        __typename
      }
      __typename
    }
    type
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

export const GET_SECURITY_INFO = `
  query getSecurityInfo($personId: ID!, $isin: ID!, $portfolioId: ID!) {
    account(id: $personId) {
      id
      brokerPortfolio(id: $portfolioId) {
        id
        security(isin: $isin) {
          ...SecurityInfoFragment
          __typename
        }
        __typename
      }
      __typename
    }
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
`;

export const GET_STATIC_SECURITY_INFO = `
  query getStaticSecurityInfo($personId: ID!, $isin: ID!, $portfolioId: ID!) {
    account(id: $personId) {
      id
      brokerPortfolio(id: $portfolioId) {
        id
        security(isin: $isin) {
          id
          isin
          wkn
          name
          type
          partnerType
          liquidityBand
          underlying {
            id
            isin
            __typename
          }
          derivativesInfo {
            id
            knockout {
              isKnocked
              __typename
            }
            expiry {
              id
              isExpired
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

export const GET_SECURITY_TICK = `
  query getSecurityTick($personId: ID!, $isin: ID!, $source: MarketDataSource, $portfolioId: ID!, $includeYearToDate: Boolean) {
    account(id: $personId) {
      id
      brokerPortfolio(id: $portfolioId) {
        id
        security(isin: $isin) {
          id
          isin
          quoteTick(source: $source, includeYearToDate: $includeYearToDate) {
            ...QuoteTickFragment
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
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

export const GET_TIME_SERIES_BY_SECURITY = `
  query getTimeSeriesBySecurity($isin: String!, $timeframes: [TimeFrame!]!, $includeYearToDate: Boolean) {
    timeSeriesBySecurity(
      isin: $isin
      timeFrames: $timeframes
      includeYearToDate: $includeYearToDate
    ) {
      id
      closingReferencePoint {
        timestampUtc {
          time
          epochMillisecond
          __typename
        }
        id
        midPrice
        __typename
      }
      isin
      timeFrame
      currency
      source
      dataPoints {
        timestampUtc {
          time
          epochMillisecond
          __typename
        }
        id
        midPrice
        __typename
      }
      __typename
    }
  }
`;

export const GET_TRADING_TRADABILITY = `
  query getTradingTradability($personId: ID!, $isin: ID!, $portfolioId: ID!) {
    account(id: $personId) {
      id
      brokerPortfolio(id: $portfolioId) {
        id
        security(isin: $isin) {
          id
          buyTradabilityForTrading {
            id
            tradabilityStatus
            venues {
              venue
              tradabilityStatus
              unavailabilityReason
              __typename
            }
            primaryVenue {
              venue
              status
              __typename
            }
            __typename
          }
          sellTradabilityForTrading {
            id
            tradabilityStatus
            venues {
              venue
              tradabilityStatus
              unavailabilityReason
              __typename
            }
            primaryVenue {
              venue
              status
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

export const IS_SECURITY_BUYABLE = `
  query isSecurityBuyable($personId: ID!, $isin: ID!, $custodianBanks: [CustodianBank!]) {
    account(id: $personId) {
      id
      brokerPortfolios(custodianBanks: $custodianBanks) {
        id
        custodianBank
        security(isin: $isin) {
          id
          buyTradabilityForTrading {
            id
            tradabilityStatus
            __typename
          }
          buyTradability {
            id
            tradabilityStatus
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
