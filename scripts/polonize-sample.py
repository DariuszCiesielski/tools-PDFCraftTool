#!/usr/bin/env python3
"""Polonizacja próbki sekcji home przez Qwen3.6 lokalny."""
import json
import urllib.request
import sys
import re

# Read source
with open('messages/en.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

home_en = data['home']
home_json = json.dumps(home_en, indent=2, ensure_ascii=False)

prompt = f"""Jesteś tłumaczem UI z angielskiego na polski. Aplikacja webowa: narzędzia PDF (konwersja, edycja, scalanie). Marka: AIwBiznesie (profesjonalny ale przystępny ton, polski rynek, "Ty" zamiast "Pan").

Zadanie: przetłumacz tylko WARTOŚCI stringów w poniższym JSON na polski. KLUCZE zostaw w angielskim. Zachowaj placeholdery jak {{count}} dosłownie.

Zasady polskie:
- Naturalne polskie tłumaczenia, nie kalki angielskie
- "PDF Tools" → "Narzędzia PDF" (nie "narzędzia PDF-owe")
- "Free" → "Darmowe" (nie "Wolne")
- "Get Started" → "Zacznij" lub "Rozpocznij" (nie "Zacznij się")
- "Browser" → "przeglądarka"
- "Privacy" → "Prywatność"
- Polskie znaki: ą ć ę ł ń ó ś ź ż obowiązkowo
- Krótkie CTA pozostają krótkie
- W opisach możesz lekko rozwinąć dla naturalności polskiej

Zwróć WYŁĄCZNIE poprawny JSON, bez komentarzy, bez bloków markdown, bez wyjaśnień. Sam JSON.

Wejście:
{home_json}

Wyjście (tylko JSON):"""

payload = {
    "model": "qwen3.6:35b-a3b",
    "prompt": prompt,
    "think": False,
    "stream": False,
    "options": {
        "temperature": 0.3,
        "num_predict": 4000
    }
}

print("Wysyłam do Qwen3.6...", file=sys.stderr)
req = urllib.request.Request(
    "http://localhost:11434/api/generate",
    data=json.dumps(payload).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)

with urllib.request.urlopen(req, timeout=180) as resp:
    result = json.loads(resp.read().decode('utf-8'))

response_text = result.get('response', '').strip()
duration_s = result.get('total_duration', 0) / 1e9
print(f"Otrzymano w {duration_s:.1f}s ({len(response_text)} znaków)", file=sys.stderr)

# Strip markdown code fence if present
if response_text.startswith('```'):
    response_text = re.sub(r'^```(?:json)?\s*\n?', '', response_text)
    response_text = re.sub(r'\n?```\s*$', '', response_text)

# Strip <think>...</think> if leaked
response_text = re.sub(r'<think>.*?</think>', '', response_text, flags=re.DOTALL).strip()

# Try to extract JSON object
json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
if json_match:
    response_text = json_match.group(0)

try:
    home_pl = json.loads(response_text)
except json.JSONDecodeError as e:
    print(f"ERROR parse JSON: {e}", file=sys.stderr)
    print("Raw response:", file=sys.stderr)
    print(response_text[:2000], file=sys.stderr)
    sys.exit(1)

# Save sample
with open('messages/pl-sample-home.json', 'w', encoding='utf-8') as f:
    json.dump(home_pl, f, indent=2, ensure_ascii=False)

print(f"\n✅ Zapisano: messages/pl-sample-home.json")
print(f"\n--- Próbka stylistyczna (przed/po) ---\n")

def walk(en, pl, prefix=""):
    rows = []
    for k in en.keys():
        ev = en.get(k)
        pv = pl.get(k) if isinstance(pl, dict) else None
        full_k = f"{prefix}.{k}" if prefix else k
        if isinstance(ev, dict):
            rows.extend(walk(ev, pv or {}, full_k))
        else:
            rows.append((full_k, ev, pv))
    return rows

rows = walk(home_en, home_pl)
for k, en_v, pl_v in rows:
    print(f"  [{k}]")
    print(f"    EN: {en_v}")
    print(f"    PL: {pl_v}")
    print()
