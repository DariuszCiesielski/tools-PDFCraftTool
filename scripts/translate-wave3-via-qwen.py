#!/usr/bin/env python3
"""
Translate Wave-3 Group A Studio tools (29 PDF utilities) to 12 other locales
using local Qwen3.6:35b-a3b via Ollama HTTP API.

Splits 29 tools into 2 batches (~15 each) per locale to avoid Qwen JSON malformation
on long outputs (lesson from Wave-2: ~30 tools/output reliable, beyond → retry needed).
"""
import json, os, sys, time, urllib.request

OLLAMA_URL = 'http://localhost:11434/api/generate'
MODEL = 'qwen3.6:35b-a3b'
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
MESSAGES = os.path.join(ROOT, 'messages')

NEW_TOOL_IDS = [
    'alternate-merge', 'combine-single-page', 'divide', 'grid-combine', 'page-dimensions',
    'pdf-booklet', 'posterize', 'reverse', 'rotate-custom', 'background-color', 'bookmark',
    'decrypt', 'deskew', 'edit-pdf', 'find-and-redact', 'fix-page-size', 'font-to-outline',
    'invert-colors', 'ocg-manager', 'pdf-to-greyscale', 'rasterize', 'remove-metadata',
    'repair', 'stamps', 'table-of-contents', 'text-color', 'linearize',
    'remove-restrictions', 'sanitize',
]

# Split into 2 batches for safer Qwen output
BATCH_SIZE = 15
BATCHES = [NEW_TOOL_IDS[i:i + BATCH_SIZE] for i in range(0, len(NEW_TOOL_IDS), BATCH_SIZE)]

LOCALES = {
    'ar': 'Arabic', 'de': 'German', 'es': 'Spanish', 'fr': 'French', 'id': 'Indonesian',
    'it': 'Italian', 'ja': 'Japanese', 'ko': 'Korean', 'pt': 'Portuguese', 'vi': 'Vietnamese',
    'zh': 'Chinese (Simplified)', 'zh-TW': 'Chinese (Traditional)',
}


def load_json(path):
    return json.load(open(path, 'r', encoding='utf-8'))


def save_json(path, data):
    json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)


def call_qwen(prompt, timeout=300):
    body = json.dumps({
        'model': MODEL, 'prompt': prompt, 'stream': False,
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
        raise ValueError(f'No JSON: {text[:300]}')
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
6. Keep brand-like terms (PDF, OCR, ZIP, OCG, JPG, PNG) verbatim.
7. Use natural, professional UI language for {locale_name}.

Input (source EN):
{json.dumps(source_data, ensure_ascii=False, indent=2)}

Output (translated to {locale_name}, same structure):"""


def translate_batch(locale, locale_name, source_tools, batch_idx, max_retries=3):
    print(f'[{locale}] Batch {batch_idx + 1}/{len(BATCHES)} ({len(source_tools)} tools)...', flush=True)
    payload = {'tools': source_tools}
    prompt = build_prompt(locale_name, payload)
    for attempt in range(max_retries):
        t0 = time.time()
        try:
            raw = call_qwen(prompt)
            translated = extract_json(raw)
            dt = time.time() - t0
            print(f'[{locale}] Batch {batch_idx + 1} OK in {dt:.1f}s (attempt {attempt + 1})', flush=True)
            return translated
        except Exception as e:
            print(f'[{locale}] Batch {batch_idx + 1} attempt {attempt + 1} FAILED: {e}', flush=True)
            time.sleep(2)
    return None


def main():
    en = load_json(os.path.join(MESSAGES, 'en.json'))
    en_tools = en.get('studio', {}).get('tools', {})
    for tid in NEW_TOOL_IDS:
        if tid not in en_tools:
            print(f'ERROR: {tid} missing in en.json', file=sys.stderr)
            return 1

    results = {}
    for locale, name in LOCALES.items():
        target_path = os.path.join(MESSAGES, f'{locale}.json')
        if not os.path.exists(target_path):
            continue
        existing = load_json(target_path)
        existing_tools = existing.get('studio', {}).get('tools', {})
        if all(tid in existing_tools for tid in NEW_TOOL_IDS):
            print(f'[{locale}] SKIP — already has all {len(NEW_TOOL_IDS)} Wave-3 tools', flush=True)
            results[locale] = 'SKIP'
            continue

        all_translated = {}
        all_ok = True
        for batch_idx, batch_ids in enumerate(BATCHES):
            source_batch = {tid: en_tools[tid] for tid in batch_ids}
            translated = translate_batch(locale, name, source_batch, batch_idx)
            if translated is None:
                all_ok = False
                break
            new_tools = translated.get('tools', {})
            all_translated.update(new_tools)

        if not all_ok:
            results[locale] = 'FAILED'
            continue

        target = load_json(target_path)
        target_tools = target.setdefault('studio', {}).setdefault('tools', {})
        for tid in NEW_TOOL_IDS:
            if tid in all_translated:
                target_tools[tid] = all_translated[tid]
            else:
                print(f'[{locale}] WARN — {tid} missing', flush=True)
        save_json(target_path, target)
        results[locale] = f'OK ({len(all_translated)}/{len(NEW_TOOL_IDS)})'
        print(f'[{locale}] WROTE → {target_path}', flush=True)

    print('\n=== SUMMARY ===', flush=True)
    for loc, status in results.items():
        print(f'  {loc}: {status}', flush=True)


if __name__ == '__main__':
    sys.exit(main() or 0)
