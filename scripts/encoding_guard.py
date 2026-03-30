#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

TEXT_SUFFIXES = {
    ".md",
    ".py",
    ".rs",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".html",
    ".css",
    ".toml",
    ".yml",
    ".yaml",
    ".bat",
    ".sh",
    ".txt",
}

DEFAULT_TARGETS = [
    Path("docs/active"),
    Path("backend"),
    Path("tauri-app/src"),
    Path("tauri-app/src-tauri/src"),
]

COMMON_SIMPLIFIED = set(
    "???????????????????????????????????????????????????????????????????"
)
SUSPICIOUS_TOKENS = [
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    "??",
    "??",
]
QUESTION_WARN_COUNT = 8
QUESTION_WARN_RATIO = 0.01


@dataclass
class ScanResult:
    path: Path
    ok: bool
    decode_error: str | None
    replacement_count: int
    null_count: int
    question_count: int
    suspicious_hits: int
    suspicious_reasons: list[str]
    suggested_repair: str | None


@dataclass
class TextMetrics:
    replacement_count: int
    null_count: int
    question_count: int
    suspicious_hits: int
    common_hits: int
    length: int


def iter_targets(targets: Iterable[str]) -> list[Path]:
    values = [Path(target) for target in targets] or DEFAULT_TARGETS
    files: list[Path] = []
    for value in values:
        if value.is_file():
            files.append(value)
            continue
        if value.is_dir():
            for child in value.rglob("*"):
                if child.is_file() and child.suffix.lower() in TEXT_SUFFIXES:
                    files.append(child)
    deduped: dict[str, Path] = {}
    for file in files:
        deduped[str(file)] = file
    return [deduped[key] for key in sorted(deduped)]


def analyze_text(text: str) -> TextMetrics:
    replacement_count = text.count("\ufffd")
    null_count = text.count("\x00")
    question_count = text.count("?")
    suspicious_hits = sum(text.count(token) for token in SUSPICIOUS_TOKENS)
    common_hits = sum(1 for ch in text if ch in COMMON_SIMPLIFIED)
    return TextMetrics(
        replacement_count=replacement_count,
        null_count=null_count,
        question_count=question_count,
        suspicious_hits=suspicious_hits,
        common_hits=common_hits,
        length=max(len(text), 1),
    )


def _try_utf8_gbk_mojibake_repair_strict(text: str) -> str | None:
    try:
        candidate = text.encode("gb18030").decode("utf-8")
    except UnicodeError:
        return None
    return candidate if candidate != text else None


def try_utf8_gbk_mojibake_repair(text: str) -> str | None:
    candidate = _try_utf8_gbk_mojibake_repair_strict(text)
    if candidate is not None:
        return candidate

    changed = False
    repaired_lines: list[str] = []
    for line in text.splitlines(keepends=True):
        line_candidate = _try_utf8_gbk_mojibake_repair_strict(line)
        if line_candidate is None:
            repaired_lines.append(line)
            continue
        if candidate_is_better(analyze_text(line), analyze_text(line_candidate)):
            repaired_lines.append(line_candidate)
            changed = True
        else:
            repaired_lines.append(line)
    if changed:
        return "".join(repaired_lines)
    return None


def candidate_is_better(original: TextMetrics, candidate: TextMetrics) -> bool:
    original_penalty = (
        original.replacement_count * 10
        + original.null_count * 10
        + original.question_count * 2
        + original.suspicious_hits * 3
        - original.common_hits
    )
    candidate_penalty = (
        candidate.replacement_count * 10
        + candidate.null_count * 10
        + candidate.question_count * 2
        + candidate.suspicious_hits * 3
        - candidate.common_hits
    )
    return candidate_penalty + 6 <= original_penalty


def scan_file(path: Path) -> ScanResult:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        return ScanResult(
            path=path,
            ok=False,
            decode_error=str(exc),
            replacement_count=-1,
            null_count=-1,
            question_count=-1,
            suspicious_hits=-1,
            suspicious_reasons=["decode-error"],
            suggested_repair=None,
        )

    metrics = analyze_text(text)
    reasons: list[str] = []
    suggested_repair: str | None = None

    if metrics.replacement_count:
        reasons.append(f"replacement={metrics.replacement_count}")
    if metrics.null_count:
        reasons.append(f"null={metrics.null_count}")
    if metrics.question_count >= QUESTION_WARN_COUNT and metrics.question_count / metrics.length >= QUESTION_WARN_RATIO:
        reasons.append(f"question={metrics.question_count}")
    if metrics.suspicious_hits:
        reasons.append(f"mojibake-token={metrics.suspicious_hits}")

    candidate = try_utf8_gbk_mojibake_repair(text)
    if candidate is not None:
        candidate_metrics = analyze_text(candidate)
        if candidate_is_better(metrics, candidate_metrics):
            reasons.append("repairable=utf8-gbk-mojibake")
            suggested_repair = "utf8-gbk-mojibake"

    ok = not reasons
    return ScanResult(
        path=path,
        ok=ok,
        decode_error=None,
        replacement_count=metrics.replacement_count,
        null_count=metrics.null_count,
        question_count=metrics.question_count,
        suspicious_hits=metrics.suspicious_hits,
        suspicious_reasons=reasons,
        suggested_repair=suggested_repair,
    )


def print_scan_result(prefix: str, result: ScanResult) -> None:
    if result.decode_error:
        print(f"{prefix} decode {result.path}: {result.decode_error}")
        return
    detail = ", ".join(result.suspicious_reasons) if result.suspicious_reasons else "clean"
    print(f"{prefix} {result.path}: {detail}")


def command_scan(args: argparse.Namespace) -> int:
    files = iter_targets(args.targets)
    if not files:
        print("scan: no files matched", file=sys.stderr)
        return 1

    flagged = 0
    for file in files:
        result = scan_file(file)
        if result.ok:
            continue
        flagged += 1
        print_scan_result("WARN", result)

    print(f"scan complete: checked={len(files)} flagged={flagged}")
    return 0 if flagged == 0 else 2


def command_verify(args: argparse.Namespace) -> int:
    files = iter_targets(args.targets)
    if not files:
        print("verify: no files matched", file=sys.stderr)
        return 1

    bad = 0
    for file in files:
        result = scan_file(file)
        if result.ok:
            print(f"OK {file}")
            continue
        bad += 1
        print_scan_result("BAD", result)

    print(f"verify complete: checked={len(files)} bad={bad}")
    return 0 if bad == 0 else 2


def repair_text(text: str, mode: str, encoding: str) -> tuple[str, str | None]:
    if mode == "transcode":
        return text, None
    if mode in {"auto", "utf8-gbk-mojibake"}:
        candidate = try_utf8_gbk_mojibake_repair(text)
        if candidate is None:
            return text, None
        if mode == "auto":
            if not candidate_is_better(analyze_text(text), analyze_text(candidate)):
                return text, None
        return candidate, "utf8-gbk-mojibake"
    raise ValueError(f"unknown repair mode: {mode}")


def command_repair(args: argparse.Namespace) -> int:
    files = iter_targets(args.targets)
    if not files:
        print("repair: no files matched", file=sys.stderr)
        return 1

    rewritten = 0
    skipped = 0
    for file in files:
        if args.mode == "transcode":
            text = file.read_text(encoding=args.encoding)
            repaired = text
            applied = f"transcode:{args.encoding}->utf-8"
        else:
            text = file.read_text(encoding="utf-8")
            repaired, used_mode = repair_text(text, args.mode, args.encoding)
            if used_mode is None:
                skipped += 1
                print(f"SKIPPED {file}: no applicable repair")
                continue
            applied = used_mode

        if repaired == text:
            skipped += 1
            print(f"SKIPPED {file}: content unchanged")
            continue

        backup = file.with_suffix(file.suffix + args.backup_ext)
        shutil.copyfile(file, backup)
        if not args.dry_run:
            file.write_text(repaired, encoding="utf-8", newline="\n")
        rewritten += 1
        action = "PREVIEW" if args.dry_run else "REPAIRED"
        print(f"{action} {file}: mode={applied} backup={backup.name}")

    print(f"repair complete: rewritten={rewritten} skipped={skipped}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="UTF-8 scan/verify/repair helper for Windows PowerShell workflows."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    scan = subparsers.add_parser("scan", help="scan text files and flag decode or suspicious content")
    scan.add_argument("targets", nargs="*", help="files or directories; defaults to key repo roots")
    scan.set_defaults(func=command_scan)

    verify = subparsers.add_parser("verify", help="verify files are valid UTF-8 and flag suspicious content")
    verify.add_argument("targets", nargs="*", help="files or directories; defaults to key repo roots")
    verify.set_defaults(func=command_verify)

    repair = subparsers.add_parser("repair", help="rewrite files using a known transcode mode or mojibake repair mode")
    repair.add_argument("targets", nargs="+", help="files or directories to rewrite")
    repair.add_argument("--encoding", default="utf-8", help="source encoding for transcode mode, such as utf-8 or gb18030")
    repair.add_argument(
        "--mode",
        choices=["auto", "transcode", "utf8-gbk-mojibake"],
        default="auto",
        help="repair mode; auto tries the mojibake heuristic before skipping",
    )
    repair.add_argument("--backup-ext", default=".bak", help="backup extension written before repair")
    repair.add_argument("--dry-run", action="store_true", help="report what would be repaired without rewriting files")
    repair.set_defaults(func=command_repair)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
