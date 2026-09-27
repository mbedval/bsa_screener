from typing import Union
from rich.progress import Progress, TextColumn, BarColumn, MofNCompleteColumn, TimeRemainingColumn, SpinnerColumn
from rich.console import Console

console = Console()

def create_phase_progress(phase_label: Union[int, str], phase_name: str, total: int, unit: str = "tickers"):
    """
    Creates a Rich progress context manager customized for BSA Engine phases.
    
    Args:
        phase_label: Phase or sub-task identifier (e.g. "Phase 1.1", "Phase 2.1", "Phase 2.4", or 1)
        phase_name: Descriptive name of the sub-task (e.g. "Download Spot", "Technical", "Chart Patterns")
        total: Total number of items/tickers to process
        unit: Unit label (e.g. "tickers", "items", "files")
    """
    if isinstance(phase_label, int):
        phase_str = f"Phase {phase_label}"
    else:
        phase_str = str(phase_label)

    description = f"[bold cyan]{phase_str}[/bold cyan] ({phase_name})"
    text_format = f"[bold yellow][ {phase_str} - {phase_name} : [/bold yellow]"
    unit_text = f"[bold yellow] {unit} ][/bold yellow]"
    
    progress = Progress(
        SpinnerColumn(),
        TextColumn(text_format),
        MofNCompleteColumn(),
        TextColumn(unit_text),
        BarColumn(bar_width=30),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        TimeRemainingColumn(),
        console=console,
        transient=False,
        refresh_per_second=10
    )
    task_id = progress.add_task(description, total=total)
    return progress, task_id
