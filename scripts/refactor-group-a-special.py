#!/usr/bin/env python3
"""
Refactor Group A SPECIAL ToolComponents — those that don't fit the std pattern:
- Different setResult variable name (setResultBlob, setResult)
- Some PDF→PDF (with onComplete) — find-and-redact, pdf-to-greyscale
- Some PDF→non-PDF (no onComplete, output is ZIP/PNG/etc.) — deskew, font-to-outline, rasterize, ocg-manager
"""
import os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

# (slug, ToolName, with_onComplete: bool, file_state_var: 'file' | 'uploadedFile')
# 'uploadedFile' means useState<UploadedFile | null> — we extract uploadedFile.file for onComplete
TOOLS = [
    # PDF→PDF with onComplete
    ('find-and-redact', 'FindAndRedactTool', True, 'file', None),  # setResult(redactionResult.result)
    ('pdf-to-greyscale', 'PDFToGreyscaleTool', True, 'uploadedFile', None),  # UploadedFile shape
    # PDF→non-PDF or unsafe-cast — refactor 3 props but NO onComplete
    ('deskew', 'DeskewPDFTool', False, 'file', None),
    ('font-to-outline', 'FontToOutlineTool', False, 'file', None),
    ('rasterize', 'RasterizePDFTool', False, 'file', None),
    ('ocg-manager', 'OCGManagerTool', False, 'file', None),
]


def patch_file(path, tool_name, with_oncomplete, state_var):
    text = open(path, 'r', encoding='utf-8').read()
    if 'initialFile?:' in text:
        return text, 'ALREADY_DONE'

    original = text

    # 1. Add useEffect to imports
    if 'useEffect' not in text:
        text = re.sub(
            r"(useState\s*,\s*useCallback)(\s*}\s*from\s*'react')",
            r"\1, useEffect\2",
            text,
            count=1,
        )

    # 2. Extend interface — single line className?:string; with optional comment above
    iface_match = re.search(
        rf"(export\s+interface\s+{tool_name}Props\s*{{\s*"
        rf"(?:/\*\*[\s\S]*?\*/\s*)?"
        rf"className\?:\s*string;\s*"
        rf"}})",
        text,
    )
    if not iface_match:
        return text, 'FAIL: interface'

    extra_props = (
        '\n  /** Optional initial file (skips upload step when prefilled from Studio) */'
        '\n  initialFile?: File;'
        '\n  /** Hide the FileUploader UI when prefilled */'
        '\n  hideUploader?: boolean;'
    )
    if with_oncomplete:
        extra_props += (
            '\n  /** Callback fired with the resulting blob and original file when processing succeeds */'
            '\n  onComplete?: (blob: Blob, originalFile: File) => void;'
        )
    new_iface = iface_match.group(1).rstrip('}').rstrip() + extra_props + '\n}'
    text = text[:iface_match.start()] + new_iface + text[iface_match.end():]

    # 3. Destructure props in function signature
    destruct = "{ className = '', initialFile, hideUploader" + (", onComplete" if with_oncomplete else "") + " }"
    text, n = re.subn(
        rf"export function {tool_name}\(\{{\s*className\s*=\s*''\s*}}:\s*{tool_name}Props\)",
        f"export function {tool_name}({destruct}: {tool_name}Props)",
        text,
        count=1,
    )
    if n == 0:
        return text, 'FAIL: function destructure'

    # 4. Init useState with initialFile
    if state_var == 'file':
        text, n = re.subn(
            r"const \[file, setFile\] = useState<File \| null>\(null\);",
            "const [file, setFile] = useState<File | null>(initialFile ?? null);",
            text,
            count=1,
        )
        if n == 0:
            return text, 'FAIL: useState init (file)'
    elif state_var == 'uploadedFile':
        # UploadedFile shape: useState<UploadedFile | null>(null)
        # We can't directly init UploadedFile from File — need to wrap. Use null init + useEffect.
        pass

    # 5. Add useEffect for initialFile reactivity
    if state_var == 'file':
        effect_body = "\n  useEffect(() => {\n    if (initialFile) {\n      setFile(initialFile);\n    }\n  }, [initialFile]);\n"
    else:  # uploadedFile
        effect_body = (
            "\n  useEffect(() => {\n"
            "    if (initialFile) {\n"
            "      setUploadedFile({ file: initialFile, id: crypto.randomUUID(), name: initialFile.name, size: initialFile.size });\n"
            "    }\n"
            "  }, [initialFile]);\n"
        )

    # Insert after first useState block — find first `useState<...>(...);` line
    # Insert BEFORE the next block (e.g. after last useState in component body)
    # Strategy: find function body opening { after "Props)" then first const that's NOT useState — insert before it
    body_start = re.search(rf"export function {tool_name}\([^)]*\)\s*{{", text)
    if body_start:
        insert_pos = body_start.end()
        # Find first const after body_start that's NOT useState/useRef/useMemo (i.e. callback or other logic)
        # Search after insert_pos for `const cancelledRef` (common) or first useCallback
        m = re.search(r"const cancelledRef = useRef\(false\);", text[insert_pos:])
        if m:
            text = text[:insert_pos + m.end()] + effect_body + text[insert_pos + m.end():]
        else:
            # Fallback: insert after last useState in first 2000 chars
            chunk = text[insert_pos:insert_pos + 2500]
            last_us = list(re.finditer(r"useState[\w<>\s|,\[\]\.]*\([^)]*\);", chunk))
            if last_us:
                fallback_pos = insert_pos + last_us[-1].end()
                text = text[:fallback_pos] + effect_body + text[fallback_pos:]

    # 6. Add onComplete to setResult sites — only when with_oncomplete
    if with_oncomplete:
        # Common pattern: setResult(output.result as Blob); or setResult(redactionResult.result);
        if state_var == 'file':
            file_arg = 'file'
        else:
            file_arg = 'uploadedFile.file'

        # find-and-redact uses setResult(redactionResult.result);
        # pdf-to-greyscale uses setResult(output.result as Blob);
        # Use generic capture
        pattern = re.compile(r'(\s+)set(Result|ResultBlob)\(([^)]+) as Blob\);')
        def replacer(m):
            indent = m.group(1)
            setter = 'set' + m.group(2)
            blob_expr = m.group(3)
            return (
                f"{indent}{{ const blob = {blob_expr} as Blob;{indent}{setter}(blob);"
                f"{indent}if (onComplete && {file_arg}) onComplete(blob, {file_arg}); }}"
            )
        text = pattern.sub(replacer, text, count=1)

    # 7. Wrap FileUploader in {!<state> && !hideUploader && (...)}
    state_check = state_var
    if f'{state_check} && !hideUploader' not in text and f'!{state_check} && !hideUploader' not in text:
        m = re.search(r'(\n[ \t]*)(<FileUploader\b[\s\S]*?/>)', text)
        if m:
            indent = m.group(1).lstrip('\n')
            already_wrapped = f'{{!{state_check} && (' in text[max(0, m.start() - 100):m.start()]
            if already_wrapped:
                # Replace existing {!<state> && (  with {!<state> && !hideUploader && (
                text = re.sub(
                    rf'\{{!{state_check} && \(',
                    f'{{!{state_check} && !hideUploader && (',
                    text,
                    count=1,
                )
            else:
                fu_tag = m.group(2)
                new_block = f'{m.group(1)}{{!{state_check} && !hideUploader && (\n{indent}  {fu_tag}\n{indent})}}'
                text = text[:m.start()] + new_block + text[m.end():]

    if text == original:
        return text, 'NO_CHANGE'
    return text, 'OK'


def main():
    results = []
    for slug, tool_name, with_oc, state_var, _ in TOOLS:
        path = os.path.join(ROOT, 'src', 'components', 'tools', slug, f'{tool_name}.tsx')
        if not os.path.exists(path):
            results.append((slug, 'MISSING'))
            continue
        text, status = patch_file(path, tool_name, with_oc, state_var)
        if status in ('ALREADY_DONE', 'NO_CHANGE') or status.startswith('FAIL'):
            results.append((slug, status))
            continue
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        results.append((slug, status))

    print('\n=== RESULTS ===')
    for slug, status in results:
        print(f'  {slug}: {status}')


if __name__ == '__main__':
    main()
