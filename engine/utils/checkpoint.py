import json
import logging
from pathlib import Path
from typing import Set, Dict, Any, Optional, Iterable

logger = logging.getLogger("bsa_checkpoint")

CHECKPOINT_FILE = Path("output/pipeline_checkpoint.json")

def _load_raw_checkpoint() -> Dict[str, Any]:
    if not CHECKPOINT_FILE.exists() or CHECKPOINT_FILE.stat().st_size == 0:
        return {}
    try:
        with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Failed to read checkpoint file: {e}")
        return {}

def _save_raw_checkpoint(data: Dict[str, Any]):
    CHECKPOINT_FILE.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to write checkpoint file: {e}")

def get_completed_tickers(phase: str, valid_tickers: Optional[Iterable[str]] = None) -> Set[str]:
    """
    Return set of completed tickers for a phase ('spot_download', 'fno_download', 'analysis').
    If valid_tickers is provided, filters completed set so it only contains tickers present in valid_tickers.
    """
    data = _load_raw_checkpoint()
    completed = set(data.get(phase, []))
    if valid_tickers is not None:
        completed &= set(valid_tickers)
    return completed

def mark_ticker_completed(phase: str, ticker: str):
    """Mark a single ticker as completed for a phase."""
    data = _load_raw_checkpoint()
    if phase not in data:
        data[phase] = []
    if ticker not in data[phase]:
        data[phase].append(ticker)
        _save_raw_checkpoint(data)

def clear_phase_checkpoint(phase: str):
    """Clear saved checkpoint for a specific phase."""
    data = _load_raw_checkpoint()
    if phase in data:
        data[phase] = []
        _save_raw_checkpoint(data)

def clear_all_checkpoints():
    """Clear all saved pipeline checkpoints."""
    if CHECKPOINT_FILE.exists():
        try:
            CHECKPOINT_FILE.unlink()
            logger.info("Cleared all pipeline checkpoints from disk.")
        except Exception as e:
            logger.error(f"Failed to delete checkpoint file: {e}")
