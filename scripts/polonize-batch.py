#!/usr/bin/env python3
"""Batch polonizacja messages/en.json przez Qwen3.6 lokalny.

Strategia: per top-level section. Sekcja 'tools' (65kB) chunkowana per podkategoria.
Output: messages/pl.json (kompletny plik z polskimi tłumaczeniami).
"""
import json
import urllib.request
import sys
import re
import time

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "qwen3.6:35b-a3b"

STYLE_RULES = """Zasady stylu polski:
- Title case po polsku tylko dla pierwszego słowa: "Profesjonalne narzędzia PDF" (NIE "Profesjonalne Narzędzia PDF")
  WYJĄTEK: hero.title może mieć Title Case dla efektu marketingowego (jeden najbardziej widoczny napis)
- "twoje" z małej litery (casual-friendly brand AIwBiznesie, nie korporacja)
- Przymiotnik > rzeczownik gdy możliwe: "100% prywatne" (NIE "100% Prywatność"), "całkowicie darmowe" (NIE "Całkowicie Darmowe")
- Polskie znaki: ą ć ę ł ń ó ś ź ż obowiązkowo, kodowanie UTF-8
- Placeholdery jak {count}, {name}, {0} zachowaj DOSŁOWNIE
- "PDF Tools" → "Narzędzia PDF" (NIE "narzędzia PDF-owe")
- "Free" → "Darmowe" (NIE "Wolne")
- "Browser" → "przeglądarka"
- "File" → "plik" / "pliki"
- "Page" → "strona" / "strony"
- "Tool" → "narzędzie"
- Naturalne polskie konstrukcje, NIE kalki angielskie
- W opisach możesz lekko rozwinąć dla naturalności polskiej (np. "your needs" → "Twoich potrzeb")
- Krótkie CTA pozostają krótkie
- W FAQ/about - profesjonalny ale przystępny ton, "Ty" forma, NIE "Pan/Pani"
"""

FEW_SHOT_EXAMPLES = """Przykłady poprawnego stylu (z próbki home):

Input: "Free, private, and powerful PDF processing in your browser"
Output: "Darmowe, prywatne i wydajne przetwarzanie PDF w twojej przeglądarce"

Input: "Get Started"
Output: "Zacznij"

Input: "100% Private"
Output: "100% prywatne"

Input: "All processing happens in your browser. Your files never leave your device."
Output: "Całe przetwarzanie odbywa się w twojej przeglądarce. Twoje pliki nigdy nie opuszczają twojego urządzenia."

Input: "Edit & Annotate"
Output: "Edycja i adnotacje"

Input: "{count}+ professional PDF tools organized by category"
Output: "Ponad {count} profesjonalnych narzędzi PDF pogrupowanych w kategorie"
"""


def call_qwen(section_name: str, section_data: dict, retries: int = 2) -> dict:
    """Call Qwen3.6 to translate one section. Returns Polish JSON dict."""
    section_json = json.dumps(section_data, indent=2, ensure_ascii=False)

    prompt = f"""Jesteś tłumaczem UI z angielskiego na polski. Aplikacja webowa: narzędzia PDF (konwersja, edycja, scalanie). Marka: AIwBiznesie (profesjonalny ale przystępny ton).

{STYLE_RULES}

{FEW_SHOT_EXAMPLES}

Zadanie: przetłumacz tylko WARTOŚCI stringów w JSON na polski. KLUCZE zostaw w angielskim. Zachowaj strukturę i typy.

Sekcja: {section_name}

Wejście:
{section_json}

Zwróć WYŁĄCZNIE poprawny JSON, bez komentarzy, bez bloków markdown ```json, bez wyjaśnień. Sam JSON od otwierającego nawiasu klamrowego do zamykającego.

Wyjście:"""

    payload = {
        "model": MODEL,
        "prompt": prompt,
        "think": False,
        "stream": False,
        "options": {
            "temperature": 0.3,
            "num_predict": 8000,
        }
    }

    last_err = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(
                OLLAMA_URL,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            t0 = time.time()
            with urllib.request.urlopen(req, timeout=300) as resp:
                result = json.loads(resp.read().decode('utf-8'))
            elapsed = time.time() - t0

            response_text = result.get('response', '').strip()

            # Strip markdown code fence
            if response_text.startswith('```'):
                response_text = re.sub(r'^```(?:json)?\s*\n?', '', response_text)
                response_text = re.sub(r'\n?```\s*$', '', response_text)

            # Strip <think>...</think> if leaked
            response_text = re.sub(r'<think>.*?</think>', '', response_text, flags=re.DOTALL).strip()

            # Extract JSON object
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                response_text = json_match.group(0)

            translated = json.loads(response_text)
            print(f"  ✅ {section_name}: {elapsed:.1f}s, {len(json.dumps(translated))} bytes", file=sys.stderr)
            return translated
        except (json.JSONDecodeError, urllib.error.URLError) as e:
            last_err = e
            print(f"  ⚠️ {section_name} attempt {attempt+1} failed: {e}", file=sys.stderr)
            if attempt < retries:
                time.sleep(3)
                continue

    print(f"  ❌ {section_name} FAILED after {retries+1} attempts. Last error: {last_err}", file=sys.stderr)
    print(f"     Returning English fallback.", file=sys.stderr)
    return section_data  # fallback to English


def keys_match(en: dict, pl: dict, path: str = "") -> list[str]:
    """Verify that PL has same keys as EN (recursively). Returns missing keys."""
    missing = []
    if isinstance(en, dict) and isinstance(pl, dict):
        for k in en:
            sub_path = f"{path}.{k}" if path else k
            if k not in pl:
                missing.append(sub_path)
            elif isinstance(en[k], dict):
                missing.extend(keys_match(en[k], pl[k], sub_path))
    return missing


def main():
    with open('messages/en.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    pl_data = {}
    total_sections = len(data)

    print(f"Polonizacja {total_sections} sekcji przez {MODEL}...\n", file=sys.stderr)

    for i, (section_name, section_value) in enumerate(data.items(), 1):
        print(f"[{i}/{total_sections}] {section_name} ({len(json.dumps(section_value))} bytes)", file=sys.stderr)

        if not isinstance(section_value, dict):
            # Scalar — copy as-is (rare)
            pl_data[section_name] = section_value
            continue

        # For huge 'tools' section, chunk per top-level key (each tool category)
        section_size = len(json.dumps(section_value))
        if section_size > 15000:
            print(f"    Sekcja {section_name} duża ({section_size}B), chunking per podsekcja...", file=sys.stderr)
            translated = {}
            sub_keys = list(section_value.keys())
            for j, sub_k in enumerate(sub_keys, 1):
                print(f"    [{j}/{len(sub_keys)}] {section_name}.{sub_k}", file=sys.stderr)
                sub_v = section_value[sub_k]
                if isinstance(sub_v, dict):
                    translated[sub_k] = call_qwen(f"{section_name}.{sub_k}", sub_v)
                else:
                    translated[sub_k] = sub_v
            pl_data[section_name] = translated
        else:
            pl_data[section_name] = call_qwen(section_name, section_value)

    # Save final
    with open('messages/pl.json', 'w', encoding='utf-8') as f:
        json.dump(pl_data, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Zapisano messages/pl.json ({len(json.dumps(pl_data))} bytes)\n", file=sys.stderr)

    # Verify keys match
    missing = keys_match(data, pl_data)
    if missing:
        print(f"⚠️ Brakujące klucze ({len(missing)}):", file=sys.stderr)
        for m in missing[:30]:
            print(f"  - {m}", file=sys.stderr)
        if len(missing) > 30:
            print(f"  ... i {len(missing)-30} więcej", file=sys.stderr)
    else:
        print("✅ Wszystkie klucze obecne w pl.json (struktura zachowana)", file=sys.stderr)


if __name__ == '__main__':
    main()
