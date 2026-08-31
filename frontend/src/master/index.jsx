import React from 'react'
import SectorsPage from './SectorsPage.jsx'
import TickersPage from './TickersPage.jsx'
import WatchlistsPage from './WatchlistsPage.jsx'
import UsersPage from './UsersPage.jsx'
import AlternativeNamesPage from './AlternativeNamesPage.jsx'
import ExcludedTickersPage from './ExcludedTickersPage.jsx'

export { SectorsPage, TickersPage, WatchlistsPage, UsersPage, AlternativeNamesPage, ExcludedTickersPage }

export default function MasterSubmodule({ subView, onNavigate }) {
  switch (subView) {
    case 'tickers':    return <TickersPage />
    case 'watchlists': return <WatchlistsPage />
    case 'users':      return <UsersPage />
    case 'aliases':
    case 'alternativenames': return <AlternativeNamesPage />
    case 'excluded':
    case 'exclusions': return <ExcludedTickersPage onNavigate={onNavigate} />
    case 'sectors':
    default:           return <SectorsPage />
  }
}

