#!/usr/bin/env python3
"""
Refactor Group A standard ToolComponents (16 tools sharing the same pattern):
- useState<File | null>(null) for main file state
- setResult(output.result as Blob) at success site

Adds Studio drawer prefilled support: initialFile/hideUploader/onComplete props.

Idempotent: skips files that already have `initialFile?` in interface.
Wraps FileUploader render in `{!file && !hideUploader && (...)}` heuristically.
"""
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

TOOLS = [
    ('background-color', 'BackgroundColorTool'),
    ('bookmark', 'BookmarkTool'),
    ('combine-single-page', 'CombineSinglePageTool'),
    ('decrypt', 'DecryptPDFTool'),
    ('divide', 'DividePagesTool'),
    ('fix-page-size', 'FixPageSizeTool'),
    ('invert-colors', 'InvertColorsTool'),
    ('page-dimensions', 'PageDimensionsTool'),
    ('posterize', 'PosterizePDFTool'),
    ('remove-metadata', 'RemoveMetadataTool'),
    ('remove-restrictions', 'RemoveRestrictionsTool'),
    ('reverse', 'ReversePagesTool'),
    ('rotate-custom', 'RotateCustomTool'),
    ('sanitize', 'SanitizePDFTool'),
    ('table-of-contents', 'TableOfContentsTool'),
    ('text-color', 'TextColorTool'),
]


def patch_file(path, tool_name):
    text = open(path, 'r', encoding='utf-8').read()
    original = text

    if 'initialFile?:' in text:
        return text, original, 'ALREADY_DONE'

    # 1. Add useEffect to imports if missing
    if "useEffect" not in text:
        text = re.sub(
            r"(useState\s*,\s*useCallback\s*,\s*useRef)\s*}\s*from\s*'react'",
            r"\1, useEffect } from 'react'",
            text,
            count=1,
        )

    # 2. Extend interface — handle both with and without comment, multi-line
    iface_match = re.search(
        rf"(export\s+interface\s+{tool_name}Props\s*{{\s*"
        rf"(?:/\*\*[\s\S]*?\*/\s*)?"
        rf"className\?:\s*string;\s*"
        rf"}})",
        text,
    )
    if not iface_match:
        return text, original, 'FAIL: interface'
    new_iface = iface_match.group(1).rstrip('}').rstrip() + '\n  /** Optional initial file (skips upload step when prefilled from Studio) */\n  initialFile?: File;\n  /** Hide the FileUploader UI when prefilled */\n  hideUploader?: boolean;\n  /** Callback fired with the resulting blob and original file when processing succeeds */\n  onComplete?: (blob: Blob, originalFile: File) => void;\n}'
    text = text[:iface_match.start()] + new_iface + text[iface_match.end():]

    # 3. Destructure new props in function signature
    text, n = re.subn(
        rf"export function {tool_name}\(\{{\s*className\s*=\s*''\s*}}:\s*{tool_name}Props\)",
        f"export function {tool_name}({{ className = '', initialFile, hideUploader, onComplete }}: {tool_name}Props)",
        text,
        count=1,
    )
    if n == 0:
        return text, original, 'FAIL: function destructure'

    # 4. Init useState with initialFile
    text, n = re.subn(
        r"const \[file, setFile\] = useState<File \| null>\(null\);",
        "const [file, setFile] = useState<File | null>(initialFile ?? null);",
        text,
        count=1,
    )
    if n == 0:
        return text, original, 'FAIL: useState init'

    # 5. Add useEffect for initialFile reactivity (after cancelledRef or first useState block)
    effect_body = "\n  useEffect(() => {\n    if (initialFile) {\n      setFile(initialFile);\n    }\n  }, [initialFile]);\n"
    if "const cancelledRef = useRef(false);" in text and "useEffect(() =>" not in text.split("const cancelledRef = useRef(false);", 1)[1][:200]:
        text = text.replace(
            "const cancelledRef = useRef(false);",
            f"const cancelledRef = useRef(false);{effect_body}",
            1,
        )
    else:
        # Fallback: insert after first setError useState (if exists)
        m = re.search(r"const \[error, setError\] = useState<string \| null>\(null\);", text)
        if m:
            text = text[:m.end()] + effect_body + text[m.end():]

    # 6. Rewrite setResult site to invoke onComplete
    pattern = re.compile(r"setResult\(output\.result as Blob\);\s*\n(\s+)setStatus\('complete'\);")
    def replacer(m):
        indent = m.group(1)
        return f"const blob = output.result as Blob;\n{indent}setResult(blob);\n{indent}setStatus('complete');\n{indent}if (onComplete && file) onComplete(blob, file);"
    text, n_setresult = pattern.subn(replacer, text, count=1)

    # 7. Add onComplete to handle*'s useCallback deps array
    pattern_deps = re.compile(r"}, \[(file[^\]]*)\]\);")
    def deps_replacer(m):
        deps = m.group(1)
        if "onComplete" in deps:
            return m.group(0)
        return f"}}, [{deps}, onComplete]);"
    text = pattern_deps.sub(deps_replacer, text)

    # 8. Wrap FileUploader render in {!file && !hideUploader && (...)}
    # Match standalone <FileUploader  ...  />  (when not already inside {!file && ... })
    # We look for `<FileUploader\n` not preceded by `{!file && ` within ~50 chars
    # and turn it into the wrapped form.
    fu_match = re.search(r"(\n\s*)(<FileUploader)\b([\s\S]*?/>)", text)
    if fu_match:
        before = text[:fu_match.start(1)]
        # Check if already wrapped in {!file
        check_window = before[-80:]
        if '{!file' not in check_window:
            indent = fu_match.group(1).lstrip('\n').replace('  ', '')  # base indent
            wrap_open = f"{fu_match.group(1)}{{!file && !hideUploader && ("
            wrap_close = f"\n{indent}  )}}"
            text = text[:fu_match.start(1)] + wrap_open + fu_match.group(1) + '  ' + fu_match.group(2) + fu_match.group(3) + wrap_close + text[fu_match.end():]

    return text, original, 'OK' if n_setresult > 0 else 'PARTIAL_setResult'


def main():
    results = []
    for slug, tool_name in TOOLS:
        path = os.path.join(ROOT, 'src', 'components', 'tools', slug, f'{tool_name}.tsx')
        if not os.path.exists(path):
            results.append((slug, 'MISSING'))
            continue
        text, original, status = patch_file(path, tool_name)
        if status == 'ALREADY_DONE':
            results.append((slug, status))
            continue
        if status.startswith('FAIL'):
            results.append((slug, status))
            continue
        if text == original:
            results.append((slug, 'NO_CHANGE'))
            continue
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        results.append((slug, status))

    print('\n=== REFACTOR RESULTS ===')
    for slug, status in results:
        print(f'  {slug}: {status}')


if __name__ == '__main__':
    main()
