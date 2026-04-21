"""
KAI – Calendar MCP Standalone Entrypoint

Some run scripts expect `calendar_mcp_standalone.py` at the repo root.
The real server lives at `backend/calendar_mcp_server.py`.

This wrapper simply executes that server module as `__main__`.
"""

from __future__ import annotations

import os
import runpy


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    target = os.path.join(here, "backend", "calendar_mcp_server.py")
    runpy.run_path(target, run_name="__main__")


if __name__ == "__main__":
    main()

