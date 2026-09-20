import yfinance as yf

for tk in ['LEENEE.NS', 'LEENEE.BO', 'LEMERITE.NS', 'LEMERITE.BO']:
    t = yf.Ticker(tk)
    print(f"\n--- {tk} ---")
    print("5d:", len(t.history(period="5d")))
    print("1mo:", len(t.history(period="1mo")))
    print("max:", len(t.history(period="max")))
