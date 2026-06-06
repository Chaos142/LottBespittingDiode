#!/usr/bin/env python3
"""
Generate BOM HTML from KiCad 7+ schematic (.kicad_sch) files.

Extracts all placed components across all schematics in hardware/,
groups by value, and replaces the BOM table in app/index.html.

Handles add/remove/modify of components automatically.
"""

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
HARDWARE_DIR = REPO_ROOT / "hardware"
INDEX_HTML = REPO_ROOT / "app" / "index.html"


def extract_components(filepath):
    """Extract BOM components from a KiCad schematic file.

    Returns list of dicts with ref, value keys.
    """
    text = filepath.read_text(encoding='utf-8')

    # Strategy: find top-level (symbol ...) blocks by scanning lines.
    # Placed symbol instances are at depth 1 inside (kicad_sch ...).
    # We skip everything inside (lib_symbols ...).

    lines = text.split('\n')
    components = []
    in_lib_symbols = 0  # nesting depth inside lib_symbols
    in_symbol = False
    symbol_block = []
    depth = 0
    reading_symbol = False

    for line in lines:
        stripped = line.strip()

        # Track depth
        open_parens = stripped.count('(')
        close_parens = stripped.count(')')

        if in_lib_symbols:
            if reading_symbol:
                symbol_block.append(line)
                depth += open_parens - close_parens
                if depth <= 1:
                    reading_symbol = False
                    _process_symbol(symbol_block, components)
                    symbol_block = []
                    depth = 0

            # Check if we're at the top level
            if stripped.startswith('(lib_symbols'):
                pass  # already tracking
            elif stripped.startswith(')') and in_lib_symbols == 1:
                # Closing lib_symbols
                pass

            # Track nesting depth inside lib_symbols
            in_lib_symbols += open_parens - close_parens
            if in_lib_symbols <= 0:
                in_lib_symbols = 0
                continue
            continue

        # Outside lib_symbols
        if line.strip().startswith('(lib_symbols'):
            in_lib_symbols = 1
            in_lib_symbols += open_parens - close_parens - 1  # subtract the opening
            continue

        if not reading_symbol:
            if stripped.startswith('(symbol'):
                reading_symbol = True
                symbol_block = [line]
                depth = open_parens - close_parens
            continue

        symbol_block.append(line)
        depth += open_parens - close_parens
        if depth <= 0:
            reading_symbol = False
            _process_symbol(symbol_block, components)
            symbol_block = []
            depth = 0

    return components


def _process_symbol(lines, components):
    """Parse a (symbol ...) block and append to components if valid."""
    block = '\n'.join(lines)

    ref = None
    value = None
    dnp = False

    lib_id_m = re.search(r'\(lib_id\s+"([^"]*)"', block)
    if not lib_id_m:
        return

    for m in re.finditer(r'\(property\s+"([^"]*)"\s+"([^"]*)"', block):
        pname = m.group(1)
        pval = m.group(2)
        if pname == 'Reference':
            ref = pval
        elif pname == 'Value':
            value = pval

    if re.search(r'\(dnp\s+yes\)', block):
        dnp = True

    if ref and value and not dnp and not ref.startswith('#') and '/' not in ref:
        components.append({'ref': ref, 'value': value})


def _ref_sort_key(ref):
    m = re.match(r'([A-Za-z]+)(\d+)', ref)
    if m:
        return (0, m.group(1), int(m.group(2)))
    return (1, ref, 0)


def format_refs(refs):
    """Compress a sorted list of refs with range notation.
    ['C6','C7','C8','C13','C17','C18'] -> 'C6\xe2\x80\x93C8, C13, C17, C18'
    """
    if not refs:
        return ''

    groups = {}
    for r in refs:
        m = re.match(r'([A-Za-z]+)(\d+)', r)
        if m:
            groups.setdefault(m.group(1), []).append(int(m.group(2)))

    parts = []
    for prefix in sorted(groups.keys()):
        nums = sorted(groups[prefix])
        runs = []
        s = e = nums[0]
        for n in nums[1:]:
            if n == e + 1:
                e = n
            else:
                runs.append((s, e))
                s = e = n
        runs.append((s, e))

        for s, e in runs:
            if s == e:
                parts.append(f"{prefix}{s}")
            elif e - s >= 2:
                parts.append(f"{prefix}{s}\u2013{prefix}{e}")
            else:
                for n in range(s, e + 1):
                    parts.append(f"{prefix}{n}")

    return ', '.join(parts)


def generate_bom(components):
    groups = {}
    for c in components:
        groups.setdefault(c['value'], []).append(c['ref'])

    rows = []
    for value, refs in groups.items():
        refs.sort(key=_ref_sort_key)
        rows.append((format_refs(refs), value, len(refs)))

    def row_key(r):
        first = r[0].split(',')[0].split('\u2013')[0].strip()
        return _ref_sort_key(first)

    rows.sort(key=row_key)
    return rows


def generate_bom_html(rows):
    lines = ['<table class="bom-table">']
    lines.append('<tr><th>Ref</th><th>Value</th><th>Qty</th></tr>')
    for ref_str, value, qty in rows:
        lines.append(
            f'<tr><td class="bom-ref">{ref_str}</td>'
            f'<td class="bom-val">{value}</td><td>{qty}</td></tr>'
        )
    lines.append('</table>')
    return '\n'.join(lines)


def replace_table(content, bom_html):
    start = content.find('<table class="bom-table">')
    if start == -1:
        print("ERROR: <table class=\"bom-table\"> not found in index.html")
        sys.exit(1)
    end = content.find('</table>', start)
    if end == -1:
        print("ERROR: </table> not found after BOM table in index.html")
        sys.exit(1)
    end += len('</table>')

    line_start = content.rfind('\n', 0, start) + 1
    indent = content[line_start:start]
    inner = indent + '  '

    lines = bom_html.split('\n')
    out = [lines[0]]  # content[:start] already has the indentation
    for line in lines[1:]:
        if line.startswith('</table>'):
            out.append(indent + line)
        elif line:
            out.append(inner + line)
        else:
            out.append(line)

    return content[:start] + '\n'.join(out) + content[end:]


def main():
    sch_files = sorted(f for f in HARDWARE_DIR.glob('*.kicad_sch') if f.name != 'prototype.kicad_sch')
    if not sch_files:
        print("No .kicad_sch files found in hardware/")
        sys.exit(1)

    all_components = []
    for f in sch_files:
        comps = extract_components(f)
        print(f"  {f.name}: {len(comps)} components")
        all_components.extend(comps)

    print(f"\n  Total: {len(all_components)} components")

    if not all_components:
        print("No components found \u2014 BOM not updated.")
        sys.exit(1)

    rows = generate_bom(all_components)
    bom_html = generate_bom_html(rows)

    print(f"\n  BOM: {len(rows)} unique entries, {sum(r[2] for r in rows)} total parts\n")
    print(bom_html)

    content = INDEX_HTML.read_text(encoding='utf-8')
    new_content = replace_table(content, bom_html)
    INDEX_HTML.write_text(new_content, encoding='utf-8')
    print(f"\n  OK - updated {INDEX_HTML.relative_to(REPO_ROOT)}")


if __name__ == '__main__':
    main()
