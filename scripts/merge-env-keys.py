#!/usr/bin/env python3
"""Fill a target env file with every key from a template, overlaying existing values."""
from __future__ import annotations

import re
import sys
from pathlib import Path

KEY_RE = re.compile(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$")


def parse_values(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = KEY_RE.match(line)
        if not match:
            continue
        key, value = match.group(1), match.group(2)
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
        values[key] = value
    return values


def merge(template: str, overlay: dict[str, str], extra: dict[str, str]) -> str:
    used: set[str] = set()
    out: list[str] = []
    for raw in template.splitlines():
        stripped = raw.strip()
        match = KEY_RE.match(stripped) if stripped and not stripped.startswith("#") else None
        if not match:
            out.append(raw)
            continue
        key = match.group(1)
        used.add(key)
        value = extra.get(key, overlay.get(key, match.group(2)))
        if any(ch in value for ch in ' {}\'"') and not (value.startswith("'") or value.startswith('"')):
            value = "'" + value.replace("'", "'\\''") + "'"
        out.append(f"{key}={value}")
    skip = {"WEEBHOOK_URL"}
    leftover = [k for k in overlay if k not in used and k not in extra and k not in skip]
    if leftover:
        out.append("")
        out.append("# Extra keys kept from the previous file")
        for key in leftover:
            out.append(f"{key}={overlay[key]}")
    return "\n".join(out).rstrip() + "\n"


def main() -> None:
    template_path = Path(sys.argv[1])
    dest_path = Path(sys.argv[2])
    rest = sys.argv[3:]
    overlay_path = dest_path
    extra_args: list[str] = []
    if rest and "=" not in rest[0]:
        overlay_path = Path(rest[0])
        extra_args = rest[1:]
    else:
        extra_args = rest
    overlay = parse_values(overlay_path.read_text()) if overlay_path.exists() else {}
    if dest_path.exists() and dest_path != overlay_path:
        overlay = {**overlay, **parse_values(dest_path.read_text())}
    if overlay.get("WEEBHOOK_URL") and not overlay.get("PUBLIC_BASE_URL"):
        overlay["PUBLIC_BASE_URL"] = overlay["WEEBHOOK_URL"].replace("/webhook", "")
    extra = dict(item.split("=", 1) for item in extra_args)
    dest_path.write_text(merge(template_path.read_text(), overlay, extra))


if __name__ == "__main__":
    main()
