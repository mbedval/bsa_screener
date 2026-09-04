from pydantic import BaseModel
from typing import Optional
from fastapi import HTTPException

class RecommendationIn(BaseModel):
    ticker: str
    rec_date: str
    recommender: str
    cmp: Optional[float] = None
    stop_loss: Optional[float] = None
    target: Optional[float] = None
    time_period: Optional[str] = None
    description: Optional[str] = None

@app.get('/api/recommendations/{ticker}')
def get_recommendations(ticker: str):
    conn = get_connection(get_dsn('intelligence'))
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, ticker, rec_date, recommender, cmp, stop_loss, target, time_period, description, created_at FROM broker_recommendations WHERE ticker = %s ORDER BY rec_date DESC", (ticker.upper(),))
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        conn.close()

@app.post('/api/recommendations')
def create_recommendation(body: RecommendationIn):
    conn = get_connection(get_dsn('intelligence'))
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO broker_recommendations (ticker, rec_date, recommender, cmp, stop_loss, target, time_period, description) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (body.ticker.upper(), body.rec_date, body.recommender, body.cmp, body.stop_loss, body.target, body.time_period, body.description)
        )
        rec_id = cur.fetchone()[0]
        conn.commit()
        return {'id': rec_id}
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        conn.close()
