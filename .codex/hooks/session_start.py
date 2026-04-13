#!/usr/bin/env python3
import json
import os
import sys

_ = json.load(sys.stdin)

# 🔔 進入 session 提醒
os.system(
    "afplay /System/Library/Sounds/Glass.aiff >/dev/null 2>&1; "
    "osascript -e 'display notification \"Codex session started\" with title \"Codex\"'"
)

# 可選：注入規則（推薦）
rules = """
Project rules:
- Prefer minimal changes
- Do not modify unrelated files
- Fix build errors before finishing
""".strip()

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": rules
    }
}))
