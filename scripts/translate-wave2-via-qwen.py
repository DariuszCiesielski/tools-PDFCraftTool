#!/usr/bin/env python3
"""
Translate Wave-2 Studio tools (10 PDF page operations) from PL/EN
into 12 other locales using local Qwen3.6:35b-a3b via Ollama HTTP API.

Reads source from messages/en.json (English authoritative for translation prompt).
Writes target translations into messages/<locale>.json under studio.tools.

Idempotent: skips locales that already have all 10 Wave-2 tools.
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
    'delete', 'organize', 'extract', 'crop', 'add-blank-page',
    'n-up', 'flatten', 'header-footer', 'remove-annotations', 'remove-blank-pages',
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
    if '<think>' in text:
        end = text.find('</think>')
        if end >= 0:
            text = text[end + len('</think>'):].strip()
    return text


def extract_json(text):
    text = text.strip()
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
6. Keep brand-like terms (PDF, N-Up) verbatim.
7. Use natural, professional UI language for {locale_name}.

Input (source EN):
{json.dumps(source_data, ensure_ascii=False, indent=2)}

Output (translated to {locale_name}, same structure):"""


def translate_locale(locale, locale_name, source_tools, max_retries=2):
    print(f'[{locale}] Translating to {locale_name}...', flush=True)
    payload = {'tools': source_tools}
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
    print(f'[{locale}] All retries exhausted: {last_err}', flush=True)
    return None


def main():
    en_path = os.path.join(MESSAGES, 'en.json')
    en = load_json(en_path)

    # Build source from EN (must have all 10 Wave-2 tools as PL/EN seeds)
    en_tools = en.get('studio', {}).get('tools', {})
    source_tools = {}
    for tid in NEW_TOOL_IDS:
        if tid not in en_tools:
            print(f'ERROR: {tid} missing in en.json. Run pl/en seed first.', file=sys.stderr)
            return 1
        source_tools[tid] = en_tools[tid]

    results = {}
    for locale, name in LOCALES.items():
        target_path = os.path.join(MESSAGES, f'{locale}.json')
        if not os.path.exists(target_path):
            print(f'[{locale}] SKIP — no file at {target_path}', flush=True)
            continue
        existing = load_json(target_path)
        existing_tools = existing.get('studio', {}).get('tools', {})
        if all(tid in existing_tools for tid in NEW_TOOL_IDS):
            print(f'[{locale}] SKIP — already has all {len(NEW_TOOL_IDS)} Wave-2 tools', flush=True)
            results[locale] = 'SKIP (already done)'
            continue
        translated = translate_locale(locale, name, source_tools)
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
        save_json(target_path, target)
        results[locale] = f"OK ({len(new_tools)}/{len(NEW_TOOL_IDS)} tools)"
        print(f'[{locale}] WROTE → {target_path}', flush=True)

    print('\n=== SUMMARY ===', flush=True)
    for loc, status in results.items():
        print(f'  {loc}: {status}', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
