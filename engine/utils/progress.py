from rich.progress import Progress, TextColumn, BarColumn, MofNCompleteColumn, TimeRemainingColumn, SpinnerColumn
from rich.console import Console

console = Console()

def create_phase_progress(phase_num: int, phase_name: str, total: int):
    """Creates a Rich progress context manager customized for BSA Engine phases."""
    description = f"[bold cyan]Phase {phase_num}[/bold cyan] ({phase_name})"
    text_format = f"[bold yellow][ Phase {phase_num} : [/bold yellow]"
    
    progress = Progress(
        SpinnerColumn(),
        TextColumn(text_format),
        MofNCompleteColumn(),
        TextColumn("[bold yellow] completed ][/bold yellow]"),
        BarColumn(bar_width=30),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        TimeRemainingColumn(),
        console=console,
        transient=False,
        refresh_per_second=10
    )
    task_id = progress.add_task(description, total=total)
    return progress, task_id
