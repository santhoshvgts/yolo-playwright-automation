"""Print manual test cases from an .xlsx as compact one-line records (UTF-8 safe).

Usage: python excel_to_cases.py <file.xlsx> [--sheet NAME]

Finds the header row on each sheet (the row containing an ID-like column and a title/steps
column), prints `ID | Module | Type | Title | Steps | Expected` per case, then counts per module.
Sheets without such a header (e.g. a summary sheet) are skipped.
"""
import sys
import io
from collections import Counter

import openpyxl

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

WANT = {
    "id": ("id", "tc id", "test case id", "tc no", "s.no", "sno"),
    "module": ("module", "feature", "area", "screen"),
    "type": ("test type", "type", "category"),
    "title": ("test case title", "title", "scenario", "test scenario", "test case", "description"),
    "steps": ("steps", "test steps", "procedure"),
    "expected": ("expected result", "expected", "expected outcome"),
}


def norm(v):
    return " ".join(str(v).split()) if v is not None else ""


def find_header(rows):
    for r_i, row in enumerate(rows[:15]):
        cells = [norm(c).lower() for c in row]
        cols = {}
        for key, names in WANT.items():
            for c_i, c in enumerate(cells):
                if c in names and key not in cols:
                    cols[key] = c_i
        if "title" in cols or "steps" in cols:
            return r_i, cols
    return None, None


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    path = sys.argv[1]
    only = sys.argv[sys.argv.index("--sheet") + 1] if "--sheet" in sys.argv else None
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    total = 0
    for ws in wb.worksheets:
        if only and ws.title != only:
            continue
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        h, cols = find_header(rows)
        if h is None:
            continue
        print(f"## {ws.title}")
        counts = Counter()
        last_module = ""
        for n, row in enumerate(rows[h + 1:], start=1):
            get = lambda k: norm(row[cols[k]]) if k in cols and cols[k] < len(row) else ""
            if not (get("title") or get("steps")):
                continue
            module = get("module") or last_module
            last_module = module
            counts[module] += 1
            total += 1
            print(" | ".join([get("id") or f"#{n}", module, get("type"), get("title"), get("steps"), get("expected")]))
        print("modules: " + ", ".join(f"{m or '-'}={c}" for m, c in counts.items()))
    print(f"total cases: {total}")


if __name__ == "__main__":
    main()
