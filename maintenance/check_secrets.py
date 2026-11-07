"""Reject recognizable credentials before publishing; never print matched values."""
from pathlib import Path
import argparse
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = {
    "google_api_key": re.compile(rb"(?<![A-Za-z0-9_-])AIza[0-9A-Za-z_-]{35}(?![A-Za-z0-9_-])"),
    "github_token": re.compile(rb"(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{60,255})"),
    "aws_access_key": re.compile(rb"(?<![A-Z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])"),
    "private_key": re.compile(rb"-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----"),
    "slack_token": re.compile(rb"xox[baprs]-[A-Za-z0-9-]{20,255}"),
    "stripe_live_secret": re.compile(rb"(?:sk|rk)_live_[A-Za-z0-9]{20,255}"),
    "openai_key": re.compile(rb"(?<![A-Za-z0-9_-])sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,255}(?![A-Za-z0-9_-])"),
}


def scan_bytes(path, content):
    return [
        {"path": path, "line": content.count(b"\n", 0, match.start()) + 1, "type": name}
        for name, pattern in PATTERNS.items()
        for match in pattern.finditer(content)
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staged", action="store_true", help="Scan the complete Git index instead of working files.")
    args = parser.parse_args()
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT)
    paths = sorted(set(p.decode("utf-8") for p in tracked.split(b"\0") if p))
    findings = []
    for path in paths:
        if args.staged:
            content = subprocess.check_output(["git", "show", ":" + path], cwd=ROOT)
        else:
            file = ROOT / path
            if not file.is_file():
                continue
            content = file.read_bytes()
        findings.extend(scan_bytes(path, content))
    print(json.dumps({"status": "failed" if findings else "passed",
                      "filesChecked": len(paths), "findings": findings}, ensure_ascii=False))
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
