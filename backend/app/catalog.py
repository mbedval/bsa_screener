"""The fixed BSA tables plus safe, runtime-discovered sector tables."""

FIXED_TABLES = {
    "historical_calls": {"label": "Historical calls", "group": "Calls"},
    "intraday_call": {"label": "Intraday calls", "group": "Calls"},
    "fno_master": {"label": "FNO Master", "group": "Derivative"},
    "fno_active": {"label": "FNO Active", "group": "Derivative"},
    "option_chain_analyzer": {"label": "Option Chain & Greeks", "group": "Derivative"},
    "best_option_strategy": {"label": "Best Option Strategy", "group": "Derivative"},
    "quicktrade_timestamp": {"label": "QuickTrade", "group": "Technical Scanners"},
    "screener_timestamp": {"label": "Screener", "group": "Technical Scanners"},
    "operatorfootprint": {"label": "Operator footprint", "group": "Technical Scanners"},
    "swinger": {"label": "Swinger", "group": "Technical Scanners"},
    "monthly_swinger": {"label": "Monthly swinger", "group": "Technical Scanners"},
    "breakout": {"label": "Breakout", "group": "Technical Scanners"},
    "trend_trading": {"label": "Trend trading", "group": "Technical Scanners"},
    "reversal_trading": {"label": "Reversal trading", "group": "Technical Scanners"},
    "support_resistance": {"label": "Support & resistance", "group": "Technical Scanners"},
    "cash_flow_summary": {"label": "Cash flow summary", "group": "Fundamental Analysis"},

    "price_history": {"label": "Price history", "group": "Fundamental Analysis"},
    "raw_fundamentals": {"label": "Raw fundamentals", "group": "Fundamental Analysis"},
    "delivery_history": {"label": "Delivery history", "group": "Fundamental Analysis"},
    "delivery_spikes": {"label": "Delivery spikes", "group": "Fundamental Analysis"},
    "sector_report": {"label": "Sector report", "group": "Fundamental Analysis"},
}

RAW_DATA_TABLES = {
    "ohlcv_daily": {"label": "OHLCV daily", "group": "Raw data"},
    "indicators_daily": {"label": "Indicators daily", "group": "Raw data"},
    "raw_fno_derivatives": {"label": "FNO Derivatives", "group": "Raw data"},
    "fundamentals": {"label": "Fundamentals", "group": "Raw data"},
    "stock_meta": {"label": "Stock metadata", "group": "Raw data"},
    "subscribers": {"label": "Subscribers", "group": "Reference"},
    "delivery_to_trade": {"label": "Delivery to trade", "group": "Analysis"},
}


# Master-data tables managed via dedicated CRUD pages — suppressed from
# the generic catalog auto-discovery loop so they don't appear as "Data tables".
MASTER_TABLES = {
    "sectors",
    "ticker_master",
    "ticker_sector",
    "watchlist",
    "watchlist_items",
    "users",
    "alternative_names",
    "excluded_tickers",
}

SYSTEM_TABLES = set()


def display_name(name: str) -> str:
    return name.replace("_delivery", " delivery spikes").replace("_", " ").title()
