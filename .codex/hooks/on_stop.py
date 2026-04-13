#!/usr/bin/env python3
import json
import os
import sys

payload = json.load(sys.stdin)

msg = (payload.get("last_assistant_message") or "").lower()

error_keywords = [
    "error",
    "failed",
    "exception",
    "build failed",
    "test failed"
]

is_error = any(k in msg for k in error_keywords)

if is_error:
    # 🔴 錯誤音效
    os.system(
        "afplay /System/Library/Sounds/Basso.aiff >/dev/null 2>&1; "
        "osascript -e 'display notification \"Codex encountered an error\" with title \"Codex\"'"
    )
else:
    # 🟢 正常完成
    os.system(
        "afplay /System/Library/Sounds/Glass.aiff >/dev/null 2>&1; "
        "osascript -e 'display notification \"Codex finished responding\" with title \"Codex\"'"
    )
