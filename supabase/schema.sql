-- =============================================
-- Supabase Schema für Schweizer Gesundheits-Jobs
-- Ausführen im Supabase SQL Editor
-- =============================================

-- 1. PROFILES (erweitert auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  education TEXT,
  field_of_study TEXT,
  experience TEXT,
  desired_regions TEXT[] DEFAULT '{}',
  workload_min INTEGER DEFAULT 50,
  workload_max INTEGER DEFAULT 100,
  languages JSONB DEFAULT '{}',
  keywords TEXT,
  exclusions TEXT[] DEFAULT '{}',
  exclusions_freetext TEXT,
  start_date TEXT,
  cv_path TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);


-- 2. FAVORITES
CREATE TABLE public.favorites (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, org_id)
);

CREATE INDEX idx_favorites_user ON public.favorites(user_id);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own favorites"
  ON public.favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own favorites"
  ON public.favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own favorites"
  ON public.favorites FOR DELETE USING (auth.uid() = user_id);


-- 3. COMMUNITY ORGS (user-submitted, approved by admin)
CREATE TABLE public.community_orgs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  canton TEXT,
  city TEXT,
  org_type TEXT,
  approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_community_orgs_approved ON public.community_orgs(approved);

ALTER TABLE public.community_orgs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read approved orgs"
  ON public.community_orgs FOR SELECT
  USING (approved = true OR auth.uid() = submitted_by);
CREATE POLICY "Authenticated users can submit orgs"
  ON public.community_orgs FOR INSERT
  WITH CHECK (auth.uid() = submitted_by);


-- 4. COMMUNITY CATEGORIES
CREATE TABLE public.community_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.community_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read approved categories"
  ON public.community_categories FOR SELECT
  USING (approved = true OR auth.uid() = user_id);
CREATE POLICY "Authenticated users can submit categories"
  ON public.community_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- 5. JOB CACHE (für KI-Matching, 24h TTL)
CREATE TABLE public.job_cache (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id TEXT NOT NULL,
  url TEXT NOT NULL,
  raw_html TEXT,
  extracted_jobs JSONB,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours'),
  UNIQUE(org_id)
);

ALTER TABLE public.job_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read job cache"
  ON public.job_cache FOR SELECT USING (true);


-- 6. CV UPLOADS (Metadaten, File in Supabase Storage)
CREATE TABLE public.cv_uploads (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  extracted_profile JSONB DEFAULT '{}',
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cv_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own CVs"
  ON public.cv_uploads FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 7. SEARCH LOGS (Analytics, anonymisiert)
CREATE TABLE public.search_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  search_params JSONB DEFAULT '{}',
  results_count INTEGER,
  clicked_jobs JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert search logs"
  ON public.search_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
