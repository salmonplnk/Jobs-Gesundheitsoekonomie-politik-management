-- Fresh Supabase installation: execute this whole file in the SQL Editor.
-- Existing installation: execute migrations/202609220001_job_workspace.sql only.
-- The complete migration is embedded below so a fresh install has identical RPCs.

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT, education TEXT, field_of_study TEXT, experience TEXT,
  desired_regions TEXT[] DEFAULT '{}', workload_min INTEGER DEFAULT 50,
  workload_max INTEGER DEFAULT 100, languages JSONB DEFAULT '{}', keywords TEXT,
  exclusions TEXT[] DEFAULT '{}', exclusions_freetext TEXT, start_date TEXT, cv_path TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(), created_at TIMESTAMPTZ DEFAULT now()
);
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
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.favorites (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(user_id, org_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON public.favorites(user_id);
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own favorites" ON public.favorites;
CREATE POLICY "Users can view own favorites" ON public.favorites FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE TABLE IF NOT EXISTS public.community_orgs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL, url TEXT NOT NULL, description TEXT, category TEXT NOT NULL,
  canton TEXT, city TEXT, org_type TEXT, approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_orgs_approved ON public.community_orgs(approved);
ALTER TABLE public.community_orgs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read approved orgs" ON public.community_orgs;
DROP POLICY IF EXISTS "Authenticated users can submit orgs" ON public.community_orgs;
CREATE POLICY "Anyone can read approved orgs" ON public.community_orgs FOR SELECT TO anon, authenticated
  USING (approved = true OR (SELECT auth.uid()) = submitted_by);
CREATE POLICY "Authenticated users can submit orgs" ON public.community_orgs FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = submitted_by AND approved = false);
GRANT SELECT ON public.community_orgs TO anon, authenticated;
GRANT INSERT ON public.community_orgs TO authenticated;
GRANT USAGE ON SEQUENCE public.community_orgs_id_seq TO authenticated;

CREATE TABLE IF NOT EXISTS public.community_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT,
  approved BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.community_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read approved categories" ON public.community_categories;
DROP POLICY IF EXISTS "Authenticated users can submit categories" ON public.community_categories;
CREATE POLICY "Anyone can read approved categories" ON public.community_categories FOR SELECT TO anon, authenticated
  USING (approved = true OR (SELECT auth.uid()) = user_id);
CREATE POLICY "Authenticated users can submit categories" ON public.community_categories FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND approved = false);
GRANT SELECT ON public.community_categories TO anon, authenticated;
GRANT INSERT ON public.community_categories TO authenticated;
GRANT USAGE ON SEQUENCE public.community_categories_id_seq TO authenticated;

CREATE TABLE IF NOT EXISTS public.job_cache (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, org_id TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL, raw_html TEXT, extracted_jobs JSONB, fetched_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours')
);
ALTER TABLE public.job_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read job cache" ON public.job_cache;
CREATE POLICY "Anyone can read job cache" ON public.job_cache FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.cv_uploads (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL, storage_path TEXT NOT NULL,
  extracted_profile JSONB DEFAULT '{}', uploaded_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.cv_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own CVs" ON public.cv_uploads;
CREATE POLICY "Users can manage own CVs" ON public.cv_uploads FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE TABLE IF NOT EXISTS public.search_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  search_params JSONB DEFAULT '{}', results_count INTEGER, clicked_jobs JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- BEGIN EMBEDDED MIGRATION 202609220001
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

-- BEGIN EMBEDDED MIGRATION 202611030001
-- E-mail job alerts. Run once after 202609220001_job_workspace.sql.
-- Idempotent and additive: creates new objects only, changes no existing data.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.job_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT CHECK (name IS NULL OR char_length(name) <= 120),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(filters) = 'object' AND pg_column_size(filters) <= 2048),
  frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily', 'weekly')),
  active BOOLEAN NOT NULL DEFAULT true,
  -- Optional override, writable only by the service role. NULL = auth e-mail at send time.
  email TEXT CHECK (email IS NULL OR (char_length(email) <= 320 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  last_sent_at TIMESTAMPTZ,
  -- Set by the sender when it claims an alert; rotates work across runs.
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_alerts_user ON public.job_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_job_alerts_due ON public.job_alerts(frequency, last_sent_at) WHERE active;

-- Normalises and validates filters, enforces at most 10 alerts per user and
-- keeps ownership immutable. Error messages are stable codes for the frontend.
CREATE OR REPLACE FUNCTION public.job_alerts_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  cleaned JSONB := '{}'::jsonb;
  entry RECORD;
  num NUMERIC;
BEGIN
  NEW.name := nullif(btrim(NEW.name), '');
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'INVALID_ALERT_OWNER' USING ERRCODE = '42501';
    END IF;
    IF (NEW.name, NEW.frequency, NEW.active, NEW.email) IS DISTINCT FROM
       (OLD.name, OLD.frequency, OLD.active, OLD.email) OR NEW.filters IS DISTINCT FROM OLD.filters THEN
      NEW.updated_at := clock_timestamp();
    END IF;
    -- Sender bookkeeping (last_checked_at/last_sent_at) does not re-validate stored filters.
    IF NEW.filters IS NOT DISTINCT FROM OLD.filters THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.filters IS NULL OR jsonb_typeof(NEW.filters) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_ALERT_FILTERS' USING ERRCODE = '22023';
  END IF;
  -- Empty strings and nulls mean "not set" and are dropped.
  FOR entry IN SELECT key, value FROM jsonb_each(NEW.filters) LOOP
    CONTINUE WHEN jsonb_typeof(entry.value) = 'null'
      OR (jsonb_typeof(entry.value) = 'string' AND btrim(entry.value #>> '{}') = '');
    IF entry.key NOT IN ('q', 'focus', 'category', 'canton', 'seniority', 'employer', 'min_workload') THEN
      RAISE EXCEPTION 'INVALID_ALERT_FILTERS' USING ERRCODE = '22023', DETAIL = entry.key;
    END IF;
    IF entry.key = 'min_workload' THEN
      IF jsonb_typeof(entry.value) <> 'number' THEN
        RAISE EXCEPTION 'INVALID_ALERT_FILTERS' USING ERRCODE = '22023', DETAIL = entry.key;
      END IF;
      num := (entry.value #>> '{}')::numeric;
      IF num <= 0 OR num > 100 THEN
        RAISE EXCEPTION 'INVALID_ALERT_FILTERS' USING ERRCODE = '22023', DETAIL = entry.key;
      END IF;
      cleaned := cleaned || jsonb_build_object(entry.key, num);
      CONTINUE;
    END IF;
    IF jsonb_typeof(entry.value) <> 'string' THEN
      RAISE EXCEPTION 'INVALID_ALERT_FILTERS' USING ERRCODE = '22023', DETAIL = entry.key;
    END IF;
    IF NOT (CASE entry.key
      WHEN 'q' THEN char_length(btrim(entry.value #>> '{}')) <= 200
      WHEN 'focus' THEN (entry.value #>> '{}') IN ('Gesundheitsökonomie / HTA', 'Gesundheitspolitik / Tarife',
        'Versorgungsforschung / Public Health', 'Projektmanagement Gesundheit',
        'Management / Controlling Gesundheit', 'Gesundheitsdaten / Analytics')
      WHEN 'category' THEN (entry.value #>> '{}') ~ '^[a-z0-9_-]{1,80}$'
      WHEN 'canton' THEN (entry.value #>> '{}') IN ('AG','AI','AR','BE','BL','BS','FR','GE','GL','GR','JU','LU','NE',
        'NW','OW','SG','SH','SO','SZ','TG','TI','UR','VD','VS','ZG','ZH')
      WHEN 'seniority' THEN (entry.value #>> '{}') IN ('praktikum', 'trainee', 'junior', 'senior', 'lead', 'phd')
      WHEN 'employer' THEN (entry.value #>> '{}') ~ '^[a-z0-9_-]{1,80}$'
      ELSE false END) THEN
      RAISE EXCEPTION 'INVALID_ALERT_FILTERS' USING ERRCODE = '22023', DETAIL = entry.key;
    END IF;
    cleaned := cleaned || jsonb_build_object(entry.key, btrim(entry.value #>> '{}'));
  END LOOP;
  NEW.filters := cleaned;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NULL THEN
      RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('job_alerts:' || NEW.user_id::text, 0));
    IF (SELECT count(*) FROM public.job_alerts AS a WHERE a.user_id = NEW.user_id) >= 10 THEN
      RAISE EXCEPTION 'ALERT_LIMIT_REACHED' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.job_alerts_before_write() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS job_alerts_before_write ON public.job_alerts;
CREATE TRIGGER job_alerts_before_write BEFORE INSERT OR UPDATE ON public.job_alerts
  FOR EACH ROW EXECUTE FUNCTION public.job_alerts_before_write();

ALTER TABLE public.job_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own job alerts" ON public.job_alerts;
DROP POLICY IF EXISTS "Users can create own job alerts" ON public.job_alerts;
DROP POLICY IF EXISTS "Users can update own job alerts" ON public.job_alerts;
DROP POLICY IF EXISTS "Users can delete own job alerts" ON public.job_alerts;
CREATE POLICY "Users can view own job alerts" ON public.job_alerts
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can create own job alerts" ON public.job_alerts
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can update own job alerts" ON public.job_alerts
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can delete own job alerts" ON public.job_alerts
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
-- Column grants: browsers manage only name, filters, frequency and active. user_id
-- comes from auth.uid(); email, token and send state are server-controlled, so an
-- alert cannot be pointed at someone else's mailbox.
REVOKE ALL ON public.job_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.job_alerts TO authenticated;
GRANT INSERT (name, filters, frequency, active) ON public.job_alerts TO authenticated;
GRANT UPDATE (name, filters, frequency, active) ON public.job_alerts TO authenticated;
GRANT ALL ON public.job_alerts TO service_role;

-- Delivery log: idempotency and "already sent" deduplication. Not exposed via API.
CREATE TABLE IF NOT EXISTS private.job_alert_deliveries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alert_id UUID NOT NULL REFERENCES public.job_alerts(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  job_ids TEXT[] NOT NULL DEFAULT '{}',
  provider_message_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_job_alert_deliveries_alert ON private.job_alert_deliveries(alert_id, sent_at DESC);
ALTER TABLE private.job_alert_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.job_alert_deliveries FROM PUBLIC, anon, authenticated;

-- One-click unsubscribe from the e-mail link; works without login.
CREATE OR REPLACE FUNCTION public.unsubscribe_job_alert(token UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  alert_name TEXT;
BEGIN
  IF token IS NULL THEN
    RETURN jsonb_build_object('unsubscribed', false);
  END IF;
  UPDATE public.job_alerts AS a SET active = false
   WHERE a.unsubscribe_token = unsubscribe_job_alert.token
   RETURNING a.name INTO alert_name;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('unsubscribed', false);
  END IF;
  RETURN jsonb_build_object('unsubscribed', true, 'name', alert_name);
END;
$$;
REVOKE ALL ON FUNCTION public.unsubscribe_job_alert(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe_job_alert(UUID) TO anon, authenticated, service_role;

-- Sender RPCs (service role only). Claims due alerts and marks them checked so
-- parallel or repeated runs do not process the same alert twice.
CREATE OR REPLACE FUNCTION public.claim_due_job_alerts(max_alerts INTEGER)
RETURNS SETOF public.job_alerts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT a.id FROM public.job_alerts AS a
     WHERE a.active
       AND (a.last_checked_at IS NULL OR a.last_checked_at < now() - interval '2 hours')
       AND (a.last_sent_at IS NULL
            OR (a.frequency = 'daily' AND a.last_sent_at < now() - interval '20 hours')
            OR (a.frequency = 'weekly' AND a.last_sent_at < now() - interval '156 hours'))
     ORDER BY a.last_checked_at NULLS FIRST, a.created_at
     LIMIT greatest(1, least(coalesce(max_alerts, 50), 500))
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.job_alerts AS a SET last_checked_at = clock_timestamp()
    FROM due WHERE a.id = due.id
  RETURNING a.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_due_job_alerts(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_job_alerts(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.job_alert_delivered_ids(alert_id UUID)
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
  SELECT coalesce(array_agg(DISTINCT item), ARRAY[]::text[])
    FROM private.job_alert_deliveries AS d, unnest(d.job_ids) AS items(item)
   WHERE d.alert_id = job_alert_delivered_ids.alert_id AND d.sent_at > now() - interval '180 days';
$$;
REVOKE ALL ON FUNCTION public.job_alert_delivered_ids(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_alert_delivered_ids(UUID) TO service_role;

-- Called only after the provider accepted the e-mail.
CREATE OR REPLACE FUNCTION public.record_job_alert_delivery(
  alert_id UUID, job_ids TEXT[], provider_message_id TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  sent TIMESTAMPTZ := clock_timestamp();
BEGIN
  INSERT INTO private.job_alert_deliveries(alert_id, sent_at, job_ids, provider_message_id)
    VALUES (record_job_alert_delivery.alert_id, sent,
            coalesce(record_job_alert_delivery.job_ids, ARRAY[]::text[]),
            left(record_job_alert_delivery.provider_message_id, 200));
  UPDATE public.job_alerts AS a SET last_sent_at = sent
   WHERE a.id = record_job_alert_delivery.alert_id;
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.record_job_alert_delivery(UUID, TEXT[], TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_job_alert_delivery(UUID, TEXT[], TEXT) TO service_role;

COMMIT;
