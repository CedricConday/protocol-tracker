import sqlite3
import os
from datetime import datetime
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

console = Console()

# Path to the database - typically located in the app data directory
# Given the project structure, we need to locate where expo-sqlite stores its DBs
# For this CLI tool, we'll assume a configurable path or search for coimbra.db
DB_PATH = os.path.expanduser('~/.expo/apps/coimbra-patient/coimbra.db')

def get_db():
    if not os.path.exists(DB_PATH):
        console.print("[red]Error: Database not found at " + DB_PATH + "[/red]")
        return None
    return sqlite3.connect(DB_PATH)

def show_schedule():
    db = get_db()
    if not db: return
    
    cursor = db.cursor()
    today = datetime.now().strftime('%Y-%m-%d')
    cursor.execute("SELECT supplement_name, scheduled_time, status FROM dose_logs WHERE date = ?", (today,))
    rows = cursor.fetchall()
    
    table = Table(title=f"Schedule for {today}")
    table.add_column("Supplement", style="cyan")
    table.add_column("Time", style="magenta")
    table.add_column("Status", style="green")
    
    for row in rows:
        table.add_row(row[0], row[1], row[2])
    
    console.print(table)
    db.close()

if __name__ == "__main__":
    console.print(Panel("[bold green]Coimbra Protocol CLI[/bold green]"))
    show_schedule()
