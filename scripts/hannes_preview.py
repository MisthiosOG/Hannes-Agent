"""Live preview UI Hannes-Agent.

Nge-watch file UI (hermes_cli/**/*.py + assets/*.txt), render ulang otomatis
tiap ada perubahan. Isi preview:
  1. Semua art di assets/hannes_banner_ascii*.txt (dengan label lebar kolom)
  2. Banner startup asli via build_welcome_banner()

Pakai: hannes-preview   (Ctrl+C buat keluar)
"""
import os
import sys
import time
from pathlib import Path

# Windows console default cp1252 - paksa UTF-8 biar ⌘ dkk ke-render
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

WATCH = ["hermes_cli/**/*.py", "assets/*.txt"]


def snapshot() -> dict:
    state = {}
    for pat in WATCH:
        for p in REPO.glob(pat):
            try:
                state[str(p)] = p.stat().st_mtime
            except OSError:
                pass
    return state


def render() -> None:
    os.system("cls" if os.name == "nt" else "clear")
    from rich.console import Console

    console = Console()

    # 1) ASCII art koleksi
    arts = sorted(REPO.glob("assets/hannes_banner_ascii*.txt"))
    if arts:
        console.print("[bold]=== KOLEKSI ART ⌘ ===[/]")
        for art in arts:
            lines = art.read_text(encoding="utf-8").splitlines()
            width = max((len(l) for l in lines), default=0)
            try:
                term_w = os.get_terminal_size().columns
            except OSError:
                term_w = 100
            fit = "fit" if width <= term_w else "[red]OVERFLOW[/]"
            console.print(f"[dim]-- {art.name} | {width} col | terminal {term_w} col | {fit} --[/]")
            console.print(art.read_text(encoding="utf-8"))

    # 2) banner startup asli
    console.print("[bold]=== BANNER STARTUP ASLI (build_welcome_banner) ===[/]")
    import hermes_cli.banner as _banner
    _banner._ui_hidden_cache = False  # preview selalu tampil walau ui_hidden: true
    from hermes_cli.banner import build_welcome_banner

    build_welcome_banner(console, model="stealth/ox-alpha", cwd=str(REPO))
    console.print("[dim]menunggu perubahan file... (Ctrl+C keluar)[/]")


def main() -> None:
    print("Live preview Hannes-Agent - watch", ", ".join(WATCH))
    time.sleep(1)
    last = None
    while True:
        cur = snapshot()
        if cur != last:
            last = cur
            try:
                render()
            except Exception as e:  # jangan mati saat editan lagi setengah jadi
                os.system("cls" if os.name == "nt" else "clear")
                print(f"[render error - fix terus auto refresh]\n{type(e).__name__}: {e}")
        time.sleep(0.5)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nbye.")
