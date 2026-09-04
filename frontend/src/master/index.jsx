import React from 'react'
import SectorsPage from './SectorsPage.jsx'
import TickersPage from './TickersPage.jsx'
import WatchlistsPage from './WatchlistsPage.jsx'
import UsersPage from './UsersPage.jsx'
import AlternativeNamesPage from './AlternativeNamesPage.jsx'
import ExcludedTickersPage from './ExcludedTickersPage.jsx'
import RecommendationsPage from './RecommendationsPage.jsx'

export { SectorsPage, TickersPage, WatchlistsPage, UsersPage, AlternativeNamesPage, ExcludedTickersPage, RecommendationsPage }

export default function MasterSubmodule({ subView, onNavigate, dataset }) {
  switch (subView) {
    case 'tickers':    return <TickersPage dataset={dataset} />
    case 'watchlists': return <WatchlistsPage dataset={dataset} />
    case 'users':      return <UsersPage dataset={dataset} />
    case 'recommendations': return <RecommendationsPage dataset={dataset} />
    case 'aliases':
    case 'alternativenames': return <AlternativeNamesPage dataset={dataset} />
    case 'excluded':
    case 'exclusions': return <ExcludedTickersPage onNavigate={onNavigate} dataset={dataset} />
    case 'sectors':
    default:           return <SectorsPage dataset={dataset} />
  }
}

