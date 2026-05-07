#!/usr/bin/env python3
"""
Refactor Wave-2 ToolComponents (9 tools sharing the same pattern) to support
Studio drawer prefilled mode: initialFile/hideUploader/onComplete props.

Pattern assumed (verified by audit):
- Imports include: useState, useCallback, useRef
- Has 'className?: string;' in props interface
- Has '({ className = \'\' }: XxxToolProps)' destructure
- Has 'useState<File | null>(null)' for the main file state
- Has 'setResult(output.result as Blob)' (or similar) for the success callback
- Has '<FileUploader' with surrounding `{!file && (...)}` or unconditional render

Per-file precise patches still need manual review for FileUploader wrapping
(some files use `{!file && <FileUploader>}`, others render unconditionally).
"""
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

TOOLS = [
    ('organize', 'OrganizePDFTool', 'handleProcess|handleApply|handleSave|handleConvert|handleOrganize'),
    ('crop', 'CropPDFTool', 'handleApply|handleCrop'),
    ('add-blank-page', 'AddBlankPageTool', 'handleAdd'),
    ('flatten', 'FlattenPDFTool', 'handleFlatten'),
    ('remove-annotations', 'RemoveAnnotationsTool', 'handleRemove'),
    ('remove-blank-pages', 'RemoveBlankPagesTool', 'handleRemove'),
    ('header-footer', 'HeaderFooterTool', 'handleApply|handleAdd'),
    ('extract', 'ExtractPagesTool', 'handleExtract'),
    ('n-up', 'NUpPDFTool', 'handleApply|handleProcess'),
]


def patch_file(path, tool_name):
    text = open(path, 'r', encoding='utf-8').read()
    original = text

    # 1. Add useEffect to imports if missing
    if "useEffect" not in text:
        text = re.sub(
            r"useState,\s*useCallback,\s*useRef\s*}\s*from\s*'react'",
            "useState, useCallback, useRef, useEffect } from 'react'",
            text,
            count=1,
        )

    # 2. Add 3 props to interface (right before the closing brace)
    iface_pattern = (
        rf"(export\s+interface\s+{tool_name}Props\s*{{\s*"
        r"(?:/\*\*[\s\S]*?\*/\s*)?className\?:\s*string;\s*)(}})"
    )
    repl = (
        r"\1"
        r"  /** Optional initial file to use (skips upload step when prefilled from Studio) */\n"
        r"  initialFile?: File;\n"
        r"  /** Hide the FileUploader UI when prefilled */\n"
        r"  hideUploader?: boolean;\n"
        r"  /** Callback fired with the resulting blob and original file when processing succeeds */\n"
        r"  onComplete?: (blob: Blob, originalFile: File) => void;\n"
        r"\2"
    )
    new_text, n = re.subn(iface_pattern, repl, text, count=1)
    if n == 0:
        # Fallback: try one-line interface
        iface_oneline = rf"(export\s+interface\s+{tool_name}Props\s*{{\s*className\?:\s*string;\s*}})"
        new_text, n = re.subn(
            iface_oneline,
            (
                rf"export interface {tool_name}Props {{\n"
                r"  className?: string;\n"
                r"  initialFile?: File;\n"
                r"  hideUploader?: boolean;\n"
                r"  onComplete?: (blob: Blob, originalFile: File) => void;\n"
                r"}"
            ),
            text,
            count=1,
        )
    if n == 0:
        return f'FAIL: could not patch interface in {path}'
    text = new_text

    # 3. Destructure new props in function signature
    text, n = re.subn(
        rf"export function {tool_name}\(\{{\s*className\s*=\s*''\s*}}:\s*{tool_name}Props\)",
        f"export function {tool_name}({{ className = '', initialFile, hideUploader, onComplete }}: {tool_name}Props)",
        text,
        count=1,
    )
    if n == 0:
        return f'FAIL: could not patch function destructure in {path}'

    # 4. Init useState with initialFile
    text, n = re.subn(
        r"const \[file, setFile\] = useState<File \| null>\(null\);",
        "const [file, setFile] = useState<File | null>(initialFile ?? null);",
        text,
        count=1,
    )
    if n == 0:
        return f'FAIL: could not patch useState init in {path}'

    return text, original


def add_use_effect(text, file_load_fn=None):
    """Insert useEffect for initialFile reactivity right after cancelledRef declaration if present,
    otherwise after the useState block."""
    effect_body = (
        "\n  useEffect(() => {\n"
        "    if (initialFile) {\n"
        "      setFile(initialFile);\n"
    )
    if file_load_fn:
        effect_body += f"      void {file_load_fn}(initialFile);\n"
    effect_body += (
        "    }\n"
        "  }, [initialFile]); // eslint-disable-line react-hooks/exhaustive-deps\n"
    )

    if "// Ref for cancellation\n  const cancelledRef = useRef(false);" in text:
        text = text.replace(
            "// Ref for cancellation\n  const cancelledRef = useRef(false);",
            f"// Ref for cancellation\n  const cancelledRef = useRef(false);{effect_body}",
            1,
        )
    elif "const cancelledRef = useRef(false);" in text:
        text = text.replace(
            "const cancelledRef = useRef(false);",
            f"const cancelledRef = useRef(false);{effect_body}",
            1,
        )
    return text


def add_on_complete_call(text):
    """Add onComplete invocation after `setResult(output.result as Blob);` followed by `setStatus('complete');`.
    Uses heuristic: replace `setResult(output.result as Blob);\n        setStatus('complete');`
    with `const blob = output.result as Blob;\n        setResult(blob);\n        setStatus('complete');\n        if (onComplete && file) onComplete(blob, file);`
    """
    pattern = re.compile(
        r"setResult\(output\.result as Blob\);\s*\n(\s+)setStatus\('complete'\);",
    )
    def replacer(m):
        indent = m.group(1)
        return (
            f"const blob = output.result as Blob;\n"
            f"{indent}setResult(blob);\n"
            f"{indent}setStatus('complete');\n"
            f"{indent}if (onComplete && file) onComplete(blob, file);"
        )
    new_text, n = pattern.subn(replacer, text, count=1)
    return new_text, n


def add_on_complete_to_deps(text):
    """Add `onComplete` to handle*'s useCallback deps array. Heuristic: find `}, [file, ...]);`
    in handle* function and add onComplete if not present."""
    # Match `}, [<deps>]);` where <deps> includes 'file'
    pattern = re.compile(r"}, \[(file[^\]]*)\]\);", re.MULTILINE)
    def replacer(m):
        deps = m.group(1)
        if "onComplete" in deps:
            return m.group(0)
        return f"}}, [{deps}, onComplete]);"
    new_text = pattern.sub(replacer, text)
    return new_text


def main():
    results = []
    for slug, tool_name, _ in TOOLS:
        path = os.path.join(ROOT, 'src', 'components', 'tools', slug, f'{tool_name}.tsx')
        if not os.path.exists(path):
            results.append((slug, 'MISSING'))
            continue
        result = patch_file(path, tool_name)
        if isinstance(result, str) and result.startswith('FAIL'):
            results.append((slug, result))
            continue
        text, original = result
        text = add_use_effect(text)
        text, n = add_on_complete_call(text)
        if n == 0:
            results.append((slug, 'WARN: setResult pattern not matched, manual review needed'))
            # Still write the rest of the patches
        text = add_on_complete_to_deps(text)
        if text == original:
            results.append((slug, 'NO_CHANGE'))
            continue
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        results.append((slug, 'OK' if n > 0 else 'PARTIAL (no setResult patch)'))

    print('\n=== REFACTOR RESULTS ===')
    for slug, status in results:
        print(f'  {slug}: {status}')


if __name__ == '__main__':
    main()
