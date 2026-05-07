# Handoff 2026-05-07 17:21 — Cross-device sync pending (recent_documents + user_preferences)

**Sesja:** druga sesja dnia (10:00 → 17:21 CEST, ~7h kalendarzowo z przerwami, ~5h aktywnej pracy)
**Status:** ZAMKNIĘTE — context się kończy, przekazane na nową sesję
**Kontynuacja:** powiedz `wznów` w nowej sesji Claude Code

---

## TL;DR dla nowego agenta

1. **PDFCraft Studio Mode** ma teraz **realną integrację narzędzi**: 5 z 7 narzędzi (Compress/Rotate/PageNumbers/Watermark/Encrypt) **prefilled current PDF + wynik replace currentFile** w studioStore. UX flow: drop PDF → klik "Skompresuj" w sidebar → drawer z opcjami → process → PDF w viewerze JEST już skompresowany. **Zero double-upload.** Live: `https://access-manager-tools-pdfcraft.vercel.app/pl/studio` (deploy `odv9s14n1`).
2. **Pending:** cross-device sync `recent_documents` (~30-40 min) + `user_preferences` (~45-60 min). **Migracja UNIQUE constraint dla recent_documents JUŻ ZAAPLIKOWANA** do prod + commit'd. Hook refactor + user_preferences hook nie rozpoczęte.
3. **Pierwszy krok jutro:** refactor `src/lib/hooks/useRecentDocuments.ts` per szczegóły niżej.

---

## Stan na koniec sesji (07.05.2026 17:21 CEST)

### ✅ Done dziś druga sesja (10:00-17:21)

**Commity (PDFCraft, w kolejności):**
1. `b3f8135` — fix(keepalive): align _keepalive schema with ecosystem (pinged_at + INSERT policy)
2. `26b2f5f` — feat(studio): UserAvatarMenu + confirmation flow UX banner (sesja rano P0)
3. `65a814e` — chore(ci): remove inherited workflows incompatible with Vercel deploy
4. `abbea8b` — feat(landing): replace tools grid with login landing page
5. `00abc3d` — feat(studio): integrate Compress/Split/Merge tools in right drawer (Tier 1)
6. `76a667a` — feat(studio): expand drawer to all 7 tools + disable menu when no files (Tier 2)
7. `842c98d` — feat(studio): real Studio↔Drawer integration (prefilled file + result replaces currentFile)
8. `b9f486d` — chore(supabase): UNIQUE constraint on recent_documents (user_id, file_name)

**Commit PM:**
- `c7bb5eb` — feat(keepalive): add PDFCraft Studio to ecosystem ping list (tier2)

**Funkcjonalnie:**
- Login landing page `/pl/` (hero + form, Linear/Notion style)
- Auth: redirect zalogowanego → `/pl/studio`
- UserAvatarMenu w prawym górnym rogu Studio
- Confirmation banner po signup confirm (`?type=signup`)
- Tools w right drawer: 7/7 narzędzi + menu disabled gdy no files
- **Integracja Studio↔Drawer**: 5 narzędzi (Compress/Rotate/PageNumbers/Watermark/Encrypt) bierze `currentFile` z store + wynik replace przez `studioStore.replaceFileData(fileId, blob, newName)`
- Split/Merge zostały z własnym FileUploader (1→N i N→1 nie pasują do prefill)
- Tools menu disabled gdy filesCount === 0
- 3 zbędne GitHub workflows usunięte (Docker/Pages/Release — spam fix)
- Migracja UNIQUE recent_documents APPLIED do prod (`wvjoeyulugbpovhjboag`)

**Smoke testy:**
- /pl/ HTTP 200 (login landing)
- /pl/studio HTTP 200, 0 console errors
- Build: 1589 static pages, 0 prerender errors

---

### 🟡 Co zostało (cross-device sync, ~75-100 min)

#### 1. recent_documents localStorage → Supabase (~30-40 min)

**Plik główny:** `src/lib/hooks/useRecentDocuments.ts` (obecne ~70 linii)

**Co zrobić:**
- Dodać `useAuth` import — wykrywanie czy zalogowany
- Tryb auth: SELECT/UPSERT/DELETE w Supabase
- Tryb guest: localStorage (current behavior)
- Sync logic post-login: po `status === 'authenticated'`, jeśli localStorage ma items → upsert do cloud → clear localStorage

**Schema (już istnieje w prod):**
```sql
CREATE TABLE public.recent_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recent_documents_user_file_unique UNIQUE (user_id, file_name)
);
-- RLS: "Users manage own recent docs" FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
```

**Szkielet kodu:**

```typescript
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { getSupabaseClient } from '@/lib/supabase/client';

export interface RecentDocument {
  name: string;
  size: number;
  lastOpened: number;
}

const STORAGE_KEY = 'studio.recentDocuments';
const MAX_RECENT = 10;

function readFromStorage(): RecentDocument[] {
  // ... existing localStorage logic, no changes
}

async function fetchFromCloud(userId: string): Promise<RecentDocument[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('recent_documents')
    .select('file_name, file_size, last_opened_at')
    .eq('user_id', userId)
    .order('last_opened_at', { ascending: false })
    .limit(MAX_RECENT);
  if (error || !data) return [];
  return data.map((row) => ({
    name: row.file_name,
    size: row.file_size,
    lastOpened: new Date(row.last_opened_at).getTime(),
  }));
}

async function upsertToCloud(userId: string, file: File): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase
    .from('recent_documents')
    .upsert(
      {
        user_id: userId,
        file_name: file.name,
        file_size: file.size,
        last_opened_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,file_name' },
    );
}

async function clearCloud(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.from('recent_documents').delete().eq('user_id', userId);
}

async function syncLocalToCloud(userId: string): Promise<void> {
  const local = readFromStorage();
  if (local.length === 0) return;
  const supabase = getSupabaseClient();
  const rows = local.map((doc) => ({
    user_id: userId,
    file_name: doc.name,
    file_size: doc.size,
    last_opened_at: new Date(doc.lastOpened).toISOString(),
  }));
  await supabase.from('recent_documents').upsert(rows, { onConflict: 'user_id,file_name' });
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function useRecentDocuments() {
  const { status, user } = useAuth();
  const [recent, setRecent] = useState<RecentDocument[]>([]);

  // Initial load (and re-load on auth state change)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (status === 'authenticated' && user) {
        // First sync local to cloud (on initial login), then fetch fresh
        await syncLocalToCloud(user.id);
        const cloud = await fetchFromCloud(user.id);
        if (!cancelled) setRecent(cloud);
      } else {
        setRecent(readFromStorage());
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [status, user]);

  // Keep listening to localStorage changes for guest mode (cross-tab)
  useEffect(() => {
    if (status === 'authenticated') return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setRecent(readFromStorage());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [status]);

  const addRecent = useCallback(
    async (file: File) => {
      if (status === 'authenticated' && user) {
        await upsertToCloud(user.id, file);
        const cloud = await fetchFromCloud(user.id);
        setRecent(cloud);
      } else if (typeof window !== 'undefined') {
        const current = readFromStorage();
        const filtered = current.filter((item) => item.name !== file.name);
        const next: RecentDocument[] = [
          { name: file.name, size: file.size, lastOpened: Date.now() },
          ...filtered,
        ].slice(0, MAX_RECENT);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setRecent(next);
      }
    },
    [status, user],
  );

  const clearRecent = useCallback(async () => {
    if (status === 'authenticated' && user) {
      await clearCloud(user.id);
      setRecent([]);
    } else if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
      setRecent([]);
    }
  }, [status, user]);

  return { recent, addRecent, clearRecent };
}
```

**Gotcha do uważnego sprawdzenia:**
- `addRecent` jest `async` teraz (poprzednio sync) — call-sites: szukaj `addRecent(file)` w `StudioLayout.tsx` i `StudioMenuBar.tsx`. Add `void` lub await.
- W call-site `pdfFiles.forEach((file) => addRecent(file))` — async w forEach robi fire-and-forget, OK.

**Po deploy verify:**
1. Otwórz `/pl/studio` jako gość, drop 2 PDF-y, refresh — recent w localStorage
2. Sign up + confirm email
3. Auto-redirect na /studio + recent z localStorage zostaną zsync'd do cloud (sprawdź Supabase Studio → recent_documents)
4. Zaloguj się na drugim browser (Firefox/inkognito) — recent powinien się pojawić cross-device

#### 2. user_preferences hook (~45-60 min)

**Schema (istnieje w prod):**
```sql
CREATE TABLE public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  locale TEXT NOT NULL DEFAULT 'pl',
  left_sidebar_width INT NOT NULL DEFAULT 288,
  right_panel_width INT NOT NULL DEFAULT 384,
  show_left_sidebar BOOLEAN NOT NULL DEFAULT true,
  show_right_panel BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Trigger: set_updated_at_user_preferences BEFORE UPDATE
-- RLS: "Users manage own preferences" FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
-- Trigger w schema: auto-create row on auth.users insert
```

**Stwórz nowy plik:** `src/lib/hooks/usePreferences.ts`

**Architektura:**
- Hook zwraca `{ theme, locale, leftSidebarWidth, rightPanelWidth, showLeftSidebar, showRightPanel, setTheme, setLocale, setLeftSidebarWidth, ... }`
- Tryb auth: SELECT na mount, UPSERT z debounce 300-500ms na zmianę
- Tryb guest: bypass (zostaw localStorage które obecnie używa useResizable)
- Conflict resolution: server-wins przy login (load before write)

**Touch points (gdzie integrować hook):**

1. **`src/components/ui/ThemeToggle.tsx`** — obecnie używa `next-themes` `useTheme()`. Po zmianie theme: jeśli authenticated → upsert do `user_preferences.theme`. Plus on mount jeśli authenticated: fetch theme z DB i `setTheme(dbTheme)`.

2. **`src/lib/hooks/useResizable.ts`** — obecnie zapisuje do localStorage przez `storageKey` prop. Refactor: jeśli authenticated, debounced upsert do `user_preferences.{left_sidebar_width|right_panel_width}` zamiast localStorage. Plus on mount fetch z DB.

3. **`src/lib/stores/studioStore.ts`** — `toggleLeftSidebar` i `toggleRightPanel` są w-store (Zustand). Dodać middleware: po zmianie state, jeśli authenticated → upsert. Lub: subskrybuj store w `usePreferences` hook + push do DB.

4. **Locale switcher** — sprawdź gdzie jest (prawdopodobnie LocaleToggle.tsx lub w next-intl middleware). Locale jest w URL (`/pl/`, `/en/`), więc preference w DB to "default locale dla user" — przy login redirect na właściwy `/<locale>/...`.

**Pattern dla każdego touch point:**
```typescript
// In component or store middleware:
const { theme, setTheme } = usePreferences();

// On user action:
setTheme('dark');  // Updates local state immediately + debounced UPSERT to DB if authenticated
```

**Debounce util** — jeśli nie ma w projekcie, użyj prostego setTimeout pattern:
```typescript
const writeTimerRef = useRef<NodeJS.Timeout | null>(null);
const scheduleWrite = useCallback((updates: Partial<UserPreferences>) => {
  if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
  writeTimerRef.current = setTimeout(() => {
    void supabase.from('user_preferences').upsert({ user_id: userId, ...updates });
  }, 400);
}, [userId]);
```

**Po wdrożeniu — verify:**
1. Login, zmień theme na dark, change sidebar widths, hide left sidebar
2. Refresh — preferences should persist (z DB, nie localStorage)
3. Open `/pl/studio` w drugim browser (po login) — same preferences powinny się załadować
4. Wyłącz/włącz showLeftSidebar przez menu Widok — sync should propagate

---

## Pierwszy krok nowego agenta

```bash
# 0. Verify produkcja nadal działa
curl -sL -o /dev/null -w "HTTP %{http_code}\n" "https://access-manager-tools-pdfcraft.vercel.app/pl/studio"
# Oczekiwane: HTTP 200

# 1. Read current useRecentDocuments
cd "/Users/dariuszciesielski/projekty/Access Manager/tools-PDFCraftTool"
cat src/lib/hooks/useRecentDocuments.ts
```

Następnie zastosuj refactor per szkielet wyżej (sekcja 1).

---

## Reference

- **PDFCraft repo:** `~/projekty/Access Manager/tools-PDFCraftTool/`
- **Production URL:** https://access-manager-tools-pdfcraft.vercel.app/pl/
- **Supabase project:** PDF Studio (`wvjoeyulugbpovhjboag`), eu-central-1 Frankfurt
- **Credentials:** `~/.claude/shared-credentials.env` `PDFCRAFT_STUDIO_*`
- **Migrations applied:**
  - `20260507100000_initial_schema.sql` — user_preferences, recent_documents, _keepalive
  - `20260507130000_keepalive_align_ecosystem.sql` — pinged_at rename + INSERT policy
  - `20260507150000_recent_documents_unique.sql` — UNIQUE (user_id, file_name)
- **Last commit:** `b9f486d` — chore(supabase): UNIQUE constraint on recent_documents
- **Last deploy:** `odv9s14n1` (Ready, alias `access-manager-tools-pdfcraft.vercel.app` points here)

---

## Lessons learned (do dopisania w CLAUDE.md PDFCraft)

- [2026-05-07] KONTEKST: Real Studio↔Drawer integration wymagała 3 propsów per ToolComponent (`initialFile`, `hideUploader`, `onComplete`) + `useEffect` na mount. 5 z 7 narzędzi miało **identyczny pattern** (`file: File | null` state + `result: Blob | null` po success), więc refactor był ~5 min per tool. Compress używał innego patternu (`useBatchProcessing` hook) i wymagał `onAllComplete` callback w options. Reguła: **przed planowaniem refactoru wieloplikowego sprawdź czy ToolComponenty mają jednolitą architekturę** — jeśli tak, copy-paste; jeśli nie, każdy wymaga indywidualnej analizy.
- [2026-05-07] KONTEKST: Tools menu w StudioMenuBar dispatched `selectTool()` nawet gdy `filesCount === 0`. Problem: bez plików ToolsPanel jest hidden (3-col layout aktywuje się tylko z plikami), więc kliknięcie tool z menu set state ale drawer niewidoczny. Fix: `disabled={filesCount === 0}` na każdym MenuItem w Tools menu. Lekcja: state-only actions w menu wymagają sprawdzenia czy ich efekt będzie WIDOCZNY w UI w aktualnym kontekście.
- [2026-05-07] KONTEKST: Estymata BACKLOG "7-14h dla integracji 7 narzędzi" zakładała pełny refactor każdego ToolComponent. Realnie wykonane w ~30 min jako **MVP-style embed** (każdy ToolComponent w drawer'ze z własnym FileUploader). Plus ~45 min dla **realnej integracji** (prefilled + result replace). Łącznie ~1h vs 7-14h. Reguła: estymaty BACKLOG dla "integracji X" warto rozbić na MVP-style (~5-15% kalendarzowej estymaty) + realną integrację (~30-40%). Pełny refactor (100%) tylko gdy wymagany. Komunikuj user'owi które poziom robisz.

---

## Status repo

- Branch: `main` (pushed origin)
- Untracked w PDFCraft (efemeryczne, nie commit):
  - `.ai/handoffs/handoff-2026-05-07-0948-studio-prod-live-confirmation-flow-pending.md`
  - `.ai/handoffs/handoff-2026-05-07-1721-cross-device-sync-pending.md` (ten plik)
  - `CLAUDE.md` (lessons learned z poprzedniej sesji rano, do uzupełnienia o powyższe + commit)

## Type check status

Czysto na nowym kodzie. 2 pre-existing errors w testach (NIE nasze):
- `src/__tests__/properties/seo.property.test.ts` L127 (TwitterMetadata)
- `src/__tests__/properties/error-messages.property.test.ts` L25 (locale type)
