import time
import random
import threading
import logging
import os
from typing import Callable, Any

logger = logging.getLogger("bsa_rate_limiter")

# Thread-safe rate limiter state
_RATE_LIMIT_LOCK = threading.Lock()
_LAST_REQUEST_TIME = 0.0

# Configurable delay and worker settings via environment variables
DEFAULT_REQUEST_DELAY = float(os.getenv("YFINANCE_REQUEST_DELAY", "0.20"))
DEFAULT_MAX_WORKERS = int(os.getenv("YFINANCE_MAX_WORKERS", "4"))

def pace_yfinance_request(delay: float = None):
    """Enforces minimum time delay between consecutive requests to Yahoo Finance across threads."""
    global _LAST_REQUEST_TIME
    target_delay = delay if delay is not None else DEFAULT_REQUEST_DELAY
    with _RATE_LIMIT_LOCK:
        now = time.time()
        elapsed = now - _LAST_REQUEST_TIME
        if elapsed < target_delay:
            time.sleep(target_delay - elapsed)
        _LAST_REQUEST_TIME = time.time()

def yfinance_safe_call(func: Callable, *args, max_retries: int = 1, retry_delay: float = 2.0, **kwargs) -> Any:
    """
    Executes a yfinance API function with rate limiting and max 1 retry (waiting 2.0 seconds before retry).
    """
    total_attempts = 1 + max_retries
    for attempt in range(1, total_attempts + 1):
        pace_yfinance_request()
        try:
            res = func(*args, **kwargs)
            return res
        except Exception as e:
            if attempt == total_attempts:
                logger.warning(f"yfinance API call failed after {total_attempts} attempt(s): {e}")
                return None

            logger.warning(f"Yahoo Finance rate limit / transient error ({e}). Retrying in {retry_delay:.1f}s (Attempt {attempt}/{max_retries})...")
            time.sleep(retry_delay)
    return None
