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
DEFAULT_REQUEST_DELAY = float(os.getenv("YFINANCE_REQUEST_DELAY", "0.35"))
DEFAULT_MAX_WORKERS = int(os.getenv("YFINANCE_MAX_WORKERS", "3"))

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

def yfinance_safe_call(func: Callable, *args, max_retries: int = 4, initial_delay: float = 1.5, **kwargs) -> Any:
    """
    Executes a yfinance API function with rate limiting, exponential backoff, and retry handling.
    Prevents HTTP 429 'Too Many Requests / Rate limited' errors.
    """
    delay = initial_delay
    for attempt in range(1, max_retries + 1):
        pace_yfinance_request()
        try:
            res = func(*args, **kwargs)
            return res
        except Exception as e:
            err_msg = str(e).lower()
            is_rate_limited = any(term in err_msg for term in ["too many requests", "rate limit", "429", "404", "jsondecodeerror", "connection error", "timeout"])
            
            if attempt == max_retries:
                logger.warning(f"yfinance API call failed after {max_retries} attempts: {e}")
                return None

            if is_rate_limited:
                jitter = random.uniform(0.2, 0.8)
                sleep_time = delay + jitter
                logger.warning(f"Yahoo Finance rate limit / transient error ({e}). Retrying in {sleep_time:.2f}s (Attempt {attempt}/{max_retries})...")
                time.sleep(sleep_time)
                delay *= 2.0
            else:
                time.sleep(0.5)
    return None
