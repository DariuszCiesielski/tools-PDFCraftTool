-- PDFCraft Studio — UNIQUE constraint on recent_documents for upsert semantics
-- Required for ON CONFLICT (user_id, file_name) DO UPDATE in useRecentDocuments hook.

ALTER TABLE public.recent_documents
  ADD CONSTRAINT recent_documents_user_file_unique UNIQUE (user_id, file_name);

NOTIFY pgrst, 'reload schema';
