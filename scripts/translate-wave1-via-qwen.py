#!/usr/bin/env python3
"""
Translate Wave-1 Studio tools (10 new tools + 'convert' category) from PL/EN
into 12 other locales using local Qwen3.6:35b-a3b via Ollama HTTP API.

Reads source from messages/pl.json (Polish authoritative for the 10 tools).
Writes target translations into messages/<locale>.json under studio.tools.
"""
import json
import os
import sys
import time
import urllib.request

OLLAMA_URL = 'http://localhost:11434/api/generate'
MODEL = 'qwen3.6:35b-a3b'
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
MESSAGES = os.path.join(ROOT, 'messages')

NEW_TOOL_IDS = [
    'ocr', 'pdf-to-docx', 'pdf-to-excel', 'pdf-to-pptx',
    'word-to-pdf', 'excel-to-pdf', 'image-to-pdf',
    'edit-metadata', 'extract-images', 'sign',
]

LOCALES = {
    'ar': 'Arabic',
    'de': 'German',
    'es': 'Spanish',
    'fr': 'French',
    'id': 'Indonesian',
    'it': 'Italian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'pt': 'Portuguese',
    'vi': 'Vietnamese',
    'zh': 'Chinese (Simplified)',
    'zh-TW': 'Chinese (Traditional)',
}


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def call_qwen(prompt, timeout=300):
    body = json.dumps({
        'model': MODEL,
        'prompt': prompt,
        'stream': False,
        'options': {'num_predict': 4096, 'temperature': 0.2},
    }).encode('utf-8')
    req = urllib.request.Request(OLLAMA_URL, data=body, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        out = json.loads(resp.read().decode('utf-8'))
    text = out.get('response', '')
    # Strip thinking block if present (Qwen3.6 default thinking mode)
    if '<think>' in text:
        end = text.find('</think>')
        if end >= 0:
            text = text[end + len('</think>'):].strip()
    return text


def extract_json(text):
    """Extract first JSON object/array from text."""
    text = text.strip()
    # Find first { and last }
    start = text.find('{')
    end = text.rfind('}')
    if start < 0 or end < 0:
        raise ValueError(f'No JSON object found in:\n{text[:500]}')
    return json.loads(text[start:end + 1])


def build_prompt(locale_name, source_data):
    return f"""/no_think
You are a translator. Translate the following English UI strings for a PDF toolkit web app from English to {locale_name}.

Rules:
1. Output ONLY valid JSON, no markdown, no explanation, no thinking.
2. Preserve the exact JSON structure and keys.
3. For "name": short label (1-3 words ideally), idiomatic in {locale_name}.
4. For "description": one sentence, action-focused.
5. For "longDescription": 1-2 sentences, more detailed.
6. Keep arrows (→) verbatim.
7. Keep brand-like terms (PDF, Word, Excel, PowerPoint, OCR, ZIP, DOCX, XLSX, PPTX, JPG, PNG) verbatim.
8. Use natural, professional UI language for {locale_name}.

Input (source EN):
{json.dumps(source_data, ensure_ascii=False, indent=2)}

Output (translated to {locale_name}, same structure):"""


def translate_locale(locale, locale_name, source_tools, source_category, max_retries=3):
    print(f'[{locale}] Translating to {locale_name}...', flush=True)
    payload = {
        'tools': source_tools,
        'category_convert': source_category,
    }
    prompt = build_prompt(locale_name, payload)
    last_err = None
    for attempt in range(max_retries):
        t0 = time.time()
        try:
            raw = call_qwen(prompt)
            translated = extract_json(raw)
            dt = time.time() - t0
            print(f'[{locale}] Got response in {dt:.1f}s (attempt {attempt + 1})', flush=True)
            return translated
        except Exception as e:
            last_err = e
            print(f'[{locale}] Attempt {attempt + 1} FAILED: {e}', flush=True)
            time.sleep(2)
    print(f'[{locale}] All {max_retries} retries exhausted: {last_err}', flush=True)
    return None


def main():
    pl_path = os.path.join(MESSAGES, 'pl.json')
    en_path = os.path.join(MESSAGES, 'en.json')
    pl = load_json(pl_path)
    en = load_json(en_path)

    # Source: EN (LLM works better with English source)
    source_tools = {tid: en['studio']['tools'][tid] for tid in NEW_TOOL_IDS}
    source_category = en['studio']['tools']['categories']['convert']

    results = {}
    for locale, name in LOCALES.items():
        target_path = os.path.join(MESSAGES, f'{locale}.json')
        if not os.path.exists(target_path):
            print(f'[{locale}] SKIP — no file at {target_path}', flush=True)
            continue
        # Skip if already translated (idempotent re-run after partial completion)
        existing = load_json(target_path)
        existing_tools = existing.get('studio', {}).get('tools', {})
        if all(tid in existing_tools for tid in NEW_TOOL_IDS) and 'convert' in existing_tools.get('categories', {}):
            print(f'[{locale}] SKIP — already has all {len(NEW_TOOL_IDS)} new tools + convert category', flush=True)
            results[locale] = 'SKIP (already done)'
            continue
        translated = translate_locale(locale, name, source_tools, source_category)
        if translated is None:
            results[locale] = 'FAILED'
            continue
        target = load_json(target_path)
        target_tools = target.setdefault('studio', {}).setdefault('tools', {})
        new_tools = translated.get('tools', {})
        for tid in NEW_TOOL_IDS:
            if tid in new_tools:
                target_tools[tid] = new_tools[tid]
            else:
                print(f'[{locale}] WARN — tool {tid} missing in response', flush=True)
        cats = target_tools.setdefault('categories', {})
        cats['convert'] = translated.get('category_convert', 'Convert')
        save_json(target_path, target)
        results[locale] = f"OK ({len(new_tools)}/{len(NEW_TOOL_IDS)} tools + convert category)"
        print(f'[{locale}] WROTE → {target_path}', flush=True)

    print('\n=== SUMMARY ===', flush=True)
    for loc, status in results.items():
        print(f'  {loc}: {status}', flush=True)


if __name__ == '__main__':
    main()
