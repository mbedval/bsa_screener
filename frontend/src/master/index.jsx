import React from 'react'
import SectorsPage from './SectorsPage.jsx'
import TickersPage from './TickersPage.jsx'
import IndicesPage from './IndicesPage.jsx'
import WatchlistsPage from './WatchlistsPage.jsx'
import UsersPage from './UsersPage.jsx'
import AlternativeNamesPage from './AlternativeNamesPage.jsx'
import ExcludedTickersPage from './ExcludedTickersPage.jsx'
import RecommendationsPage from './RecommendationsPage.jsx'
import OpportunitiesRiskPage from './OpportunitiesRiskPage.jsx'
import ReferencePagesPage from './ReferencePagesPage.jsx'
import ScreenerTickerMappingPage from './ScreenerTickerMappingPage.jsx'

export { SectorsPage, TickersPage, IndicesPage, WatchlistsPage, UsersPage, AlternativeNamesPage, ExcludedTickersPage, RecommendationsPage, OpportunitiesRiskPage, ReferencePagesPage, ScreenerTickerMappingPage }

export default function MasterSubmodule({ subView, onNavigate, dataset, onSelectTicker }) {
  switch (subView) {
    case 'tickers':    return <TickersPage dataset={dataset} onSelectTicker={onSelectTicker} />
    case 'indices':    return <IndicesPage dataset={dataset} />
    case 'watchlists': return <WatchlistsPage dataset={dataset} />
    case 'users':      return <UsersPage dataset={dataset} />
    case 'recommendations': return <RecommendationsPage dataset={dataset} />
    case 'opportunities':
    case 'opportunities_risk': return <OpportunitiesRiskPage dataset={dataset} />
    case 'aliases':
    case 'alternativenames': return <AlternativeNamesPage dataset={dataset} />
    case 'excluded':
    case 'exclusions': return <ExcludedTickersPage onNavigate={onNavigate} dataset={dataset} />
    case 'references':
    case 'reference_pages': return <ReferencePagesPage dataset={dataset} />
    case 'screener_mappings': return <ScreenerTickerMappingPage />
    case 'sectors':
    default:           return <SectorsPage dataset={dataset} />
  }
}

