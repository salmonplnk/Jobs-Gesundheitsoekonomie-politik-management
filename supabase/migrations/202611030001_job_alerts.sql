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
