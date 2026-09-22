-- Existing installations: run this migration once after backing up the database.
-- Idempotent: preserves profiles, favourites, documents and existing workspace data.
BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  INSERT INTO public.profiles(id, email) VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- A proposal cannot approve itself by supplying approved=true in the API call.
DROP POLICY IF EXISTS "Authenticated users can submit orgs" ON public.community_orgs;
CREATE POLICY "Authenticated users can submit orgs" ON public.community_orgs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = submitted_by AND approved = false);
DROP POLICY IF EXISTS "Authenticated users can submit categories" ON public.community_categories;
CREATE POLICY "Authenticated users can submit categories" ON public.community_categories
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND approved = false);

CREATE TABLE IF NOT EXISTS public.job_workspaces (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.job_workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own workspace" ON public.job_workspaces;
CREATE POLICY "Users can view own workspace" ON public.job_workspaces
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.job_workspaces FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.job_workspaces TO authenticated;
GRANT ALL ON public.job_workspaces TO service_role;

CREATE OR REPLACE FUNCTION public.save_job_workspace(payload JSONB, expected_revision BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  actor UUID := auth.uid();
  saved public.job_workspaces%ROWTYPE;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object'
     OR expected_revision IS NULL OR expected_revision < 0 THEN
    RAISE EXCEPTION 'INVALID_WORKSPACE' USING ERRCODE = '22023';
  END IF;

  -- A concurrent first insert waits here. The following conditional UPDATE then
  -- sees its committed revision, so a stale client cannot overwrite that data.
  INSERT INTO public.job_workspaces(user_id) VALUES (actor)
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.job_workspaces
     SET data = payload, revision = revision + 1, updated_at = clock_timestamp()
   WHERE user_id = actor AND revision = expected_revision
   RETURNING * INTO saved;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKSPACE_CONFLICT' USING ERRCODE = '40001';
  END IF;
  RETURN jsonb_build_object('data', saved.data, 'revision', saved.revision,
                            'updated_at', saved.updated_at);
END;
$$;
REVOKE ALL ON FUNCTION public.save_job_workspace(JSONB, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_job_workspace(JSONB, BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.replace_favorites(org_ids TEXT[])
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  actor UUID := auth.uid();
  normalized TEXT[];
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF cardinality(coalesce(org_ids, ARRAY[]::text[])) > 1000 THEN
    RAISE EXCEPTION 'TOO_MANY_FAVORITES' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT btrim(item) ORDER BY btrim(item)), ARRAY[]::text[])
    INTO normalized FROM unnest(coalesce(org_ids, ARRAY[]::text[])) AS items(item)
   WHERE item IS NOT NULL AND btrim(item) <> '';
  PERFORM pg_advisory_xact_lock(hashtextextended('favorites:' || actor::text, 0));
  DELETE FROM public.favorites WHERE user_id = actor AND NOT (org_id = ANY(normalized));
  INSERT INTO public.favorites(user_id, org_id)
    SELECT actor, item FROM unnest(normalized) AS items(item)
    ON CONFLICT (user_id, org_id) DO NOTHING;
  RETURN jsonb_build_object('org_ids', normalized);
END;
$$;
REVOKE ALL ON FUNCTION public.replace_favorites(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_favorites(TEXT[]) TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.favorites FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.favorites TO authenticated;

-- Quota state is deliberately outside the exposed public schema. Analytics logs
-- are not a counter: failures and parallel calls must also consume a reservation.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.job_quotas (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_name TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  PRIMARY KEY (user_id, action_name)
);
ALTER TABLE private.job_quotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.job_quotas FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_job_quota(
  action_name TEXT, max_requests INTEGER, window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  actor UUID := auth.uid();
  policy_limit INTEGER;
  policy_window INTERVAL := interval '1 hour';
  quota private.job_quotas%ROWTYPE;
  checked_at TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  -- Parameters remain in the RPC contract for compatibility, but callers cannot
  -- raise limits, reset a window, or invent a new quota bucket.
  policy_limit := CASE action_name
    WHEN 'match-jobs' THEN 60
    WHEN 'generate-cover-letter' THEN 10
    WHEN 'parse-cv' THEN 10
    WHEN 'assess-job' THEN 10
    ELSE NULL END;
  IF policy_limit IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN_QUOTA_ACTION' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('quota:' || actor::text || ':' || action_name, 0));
  SELECT * INTO quota FROM private.job_quotas AS q
    WHERE q.user_id = actor AND q.action_name = consume_job_quota.action_name;
  IF NOT FOUND OR quota.window_start + policy_window <= checked_at THEN
    INSERT INTO private.job_quotas AS q(user_id, action_name, window_start, request_count)
      VALUES (actor, action_name, checked_at, 1)
      ON CONFLICT ON CONSTRAINT job_quotas_pkey DO UPDATE
        SET window_start = excluded.window_start, request_count = 1;
    RETURN true;
  END IF;
  IF quota.request_count >= policy_limit THEN RETURN false; END IF;
  UPDATE private.job_quotas AS q SET request_count = q.request_count + 1
    WHERE q.user_id = actor AND q.action_name = consume_job_quota.action_name;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_job_quota(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_job_quota(TEXT, INTEGER, INTEGER) TO authenticated;

-- Register only an existing upload owned by the caller. Replacement of a CV is
-- transactional; old file cleanup is performed after this RPC has succeeded.
CREATE OR REPLACE FUNCTION public.register_cv_upload(
  file_name TEXT, storage_path TEXT, extracted_profile JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  actor UUID := auth.uid();
  doc_type TEXT := extracted_profile->>'doc_type';
  saved public.cv_uploads%ROWTYPE;
  replaced TEXT[] := ARRAY[]::text[];
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF file_name IS NULL OR btrim(file_name) = '' OR storage_path IS NULL
     OR split_part(storage_path, '/', 1) <> 'cvs'
     OR split_part(storage_path, '/', 2) <> actor::text
     OR coalesce(doc_type, '') NOT IN ('cv', 'zeugnis', 'andere') THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects AS o
                 WHERE o.bucket_id = 'cv-uploads' AND o.name = register_cv_upload.storage_path) THEN
    RAISE EXCEPTION 'DOCUMENT_UPLOAD_MISSING' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('documents:' || actor::text, 0));
  SELECT * INTO saved FROM public.cv_uploads AS c
    WHERE c.user_id = actor AND c.storage_path = register_cv_upload.storage_path
    ORDER BY c.id DESC LIMIT 1;
  IF FOUND THEN
    RETURN to_jsonb(saved) || jsonb_build_object('replaced_storage_paths', replaced);
  END IF;
  IF doc_type = 'cv' THEN
    SELECT coalesce(array_agg(c.storage_path), ARRAY[]::text[]) INTO replaced
      FROM public.cv_uploads AS c
      WHERE c.user_id = actor AND c.extracted_profile->>'doc_type' = 'cv';
    DELETE FROM public.cv_uploads AS c
      WHERE c.user_id = actor AND c.extracted_profile->>'doc_type' = 'cv';
  ELSIF (SELECT count(*) FROM public.cv_uploads AS c
         WHERE c.user_id = actor AND coalesce(c.extracted_profile->>'doc_type', 'andere') <> 'cv') >= 5 THEN
    RAISE EXCEPTION 'DOCUMENT_LIMIT_REACHED' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.cv_uploads(user_id, file_name, storage_path, extracted_profile)
    VALUES (actor, file_name, storage_path, extracted_profile) RETURNING * INTO saved;
  RETURN to_jsonb(saved) || jsonb_build_object('replaced_storage_paths', replaced);
END;
$$;
REVOKE ALL ON FUNCTION public.register_cv_upload(TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_cv_upload(TEXT, TEXT, JSONB) TO authenticated;
REVOKE INSERT, UPDATE, TRUNCATE ON public.cv_uploads FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.cv_uploads TO authenticated;

-- Search history may contain preferences and document-derived details: only its
-- owner can read/insert it. Existing anonymous rows remain stored but private.
ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can insert search logs" ON public.search_logs;
DROP POLICY IF EXISTS "Users can view own search logs" ON public.search_logs;
CREATE POLICY "Users can insert search logs" ON public.search_logs
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can view own search logs" ON public.search_logs
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.search_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.search_logs TO authenticated;
GRANT USAGE ON SEQUENCE public.search_logs_id_seq TO authenticated;
CREATE INDEX IF NOT EXISTS idx_search_logs_user_created ON public.search_logs(user_id, created_at DESC);

-- Shared cache contains source material, never a person's matching results.
-- Only the service role in the authenticated Edge Function may write it.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.job_cache FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.job_cache TO anon, authenticated;
GRANT ALL ON public.job_cache TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.job_cache_id_seq TO service_role;

-- Preserve existing PDFs and paths while making the bucket private.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('cv-uploads', 'cv-uploads', false, 5242880, ARRAY['application/pdf'])
  ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880,
    allowed_mime_types = ARRAY['application/pdf'];
DROP POLICY IF EXISTS "Users can manage own CV files" ON storage.objects;
DROP POLICY IF EXISTS "CV files are restricted to their owner" ON storage.objects;
CREATE POLICY "Users can manage own CV files" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'cv-uploads' AND (storage.foldername(name))[1] = 'cvs'
         AND (storage.foldername(name))[2] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'cv-uploads' AND (storage.foldername(name))[1] = 'cvs'
              AND (storage.foldername(name))[2] = (SELECT auth.uid())::text);
-- Restrictive guard also applies if an older installation has a permissive
-- policy for other buckets. It changes no access rules for those other buckets.
CREATE POLICY "CV files are restricted to their owner" ON storage.objects
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (bucket_id <> 'cv-uploads' OR ((SELECT auth.uid()) IS NOT NULL
         AND (storage.foldername(name))[1] = 'cvs'
         AND (storage.foldername(name))[2] = (SELECT auth.uid())::text))
  WITH CHECK (bucket_id <> 'cv-uploads' OR ((SELECT auth.uid()) IS NOT NULL
              AND (storage.foldername(name))[1] = 'cvs'
              AND (storage.foldername(name))[2] = (SELECT auth.uid())::text));

COMMIT;
