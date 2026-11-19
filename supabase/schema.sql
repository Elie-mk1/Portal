-- =====================================================================
-- EM Recruiting Copilot (Project 3) — Supabase schema
-- Run this whole file once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run: it uses IF NOT EXISTS / CREATE OR REPLACE everywhere.
-- All tables are prefixed rc_ ("recruiting copilot").
-- =====================================================================

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Settings: one place for every config value the n8n workflows read.
-- ---------------------------------------------------------------------
create table if not exists rc_settings (
  key         text primary key,
  value       text not null default '',
  description text
);

insert into rc_settings (key, value, description) values
 ('supabase_url',            'https://YOUR-PROJECT-REF.supabase.co', 'Your Supabase Project URL (Project Settings → Data API). n8n uses it for database/storage calls.'),
 ('n8n_webhook_base',        'https://n8ndemo.remotelyx.com/webhook', 'Base URL of n8n production webhooks (no trailing slash).'),
 ('portal_url',              'https://YOUR-PORTAL.vercel.app',        'Live recruiter portal URL (used for links in Slack).'),
 ('slack_channel_id',        'C0XXXXXXX',                             'Slack channel ID where approvals are posted (right-click channel → View details → bottom).'),
 ('slack_signing_secret',    '',                                      'Slack app → Basic Information → Signing Secret. Used to verify requests really come from Slack.'),
 ('gemini_base',             'https://generativelanguage.googleapis.com/v1beta', 'Gemini API base URL.'),
 ('gemini_model',            'gemini-3.8-flash',                      'Main Gemini model for reading CVs, writing JDs and judging matches.'),
 ('gemini_fallback_model',   'gemini-3.1-flash-lite',                 'Backup Gemini model, used automatically when the main one answers "busy" (503) or "quota" (429).'),
 ('gemini_embed_model',      'gemini-embedding-001',                  'Gemini embedding model (768 dimensions are stored).'),
 ('ghl_base',                'https://services.leadconnectorhq.com',  'GoHighLevel API v2 base URL.'),
 ('ghl_location_id',         'YOUR_GHL_LOCATION_ID',                  'GHL sandbox Location ID.'),
 ('ghl_pipeline_name',       'EM-Candidate Pipeline',                 'Name of the GHL pipeline to use (create it in GHL first).'),
 ('ghl_pipeline_id',         '',                                      'Filled automatically by workflow "EM-P3 00 Setup".'),
 ('ghl_stages',              '{}',                                    'JSON map stage name → stage id. Filled automatically by "EM-P3 00 Setup".'),
 ('gmail_base',              'https://gmail.googleapis.com/gmail/v1/users/me', 'Gmail API base URL.'),
 ('slack_api_base',          'https://slack.com/api',                 'Slack Web API base URL.'),
 ('test_mode',               'true',                                  'true = every email goes to test_email (plus-addressed per person), never to the real address.'),
 ('test_email',              'you@gmail.com',                         'YOUR own Gmail address. In test mode candidate emails become you+name@gmail.com.'),
 ('recruiter_name',          'Elie',                                  'Name used to sign outreach emails.'),
 ('agency_name',             'RemoteBridge Staffing',                 'Agency name used in emails.'),
 ('sequence_delays_minutes', '0,10,20',                               'Minutes to wait before email 1, 2, 3 (each counted from the previous email). Demo: 0,10,20 — real life: 0,4320,10080 (now, +3 days, +7 days).'),
 ('final_wait_minutes',      '30',                                    'After the last email, minutes to wait for a reply before marking "No response".'),
 ('min_match_score',         '60',                                    'A candidate must score at least this (0-100) AND meet every must-have to be called a match.'),
 ('send_jd_to_client',       'true',                                  'true = when a JD is approved, email it to the client (test_email in test mode).'),
 ('ghl_form_url',            '',                                      'GHL form mode (read-only GHL key): link of the GHL form "EM-Candidate Approval". Empty = n8n writes to GHL itself (needs a write key).'),
 ('ghl_form_role_key',       'em_role_title',                         'Query key of the "EM-Role Title" field in that GHL form (used to pre-fill it).')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Roles (one per client call) — JD lives here
-- ---------------------------------------------------------------------
create sequence if not exists rc_role_seq;
create table if not exists rc_roles (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null default ('EM-R' || lpad(nextval('rc_role_seq')::text, 3, '0')),
  title           text not null default 'Untitled role',
  client_name     text,
  client_contact  text,
  client_email    text,
  status          text not null default 'pending_approval'
                  check (status in ('drafting','pending_approval','changes_requested','open','rejected','closed')),
  transcript      text not null,
  jd              jsonb,                 -- structured JD (see README "JD format")
  jd_markdown     text,                  -- human-readable JD
  must_haves      jsonb default '[]',
  nice_to_haves   jsonb default '[]',
  open_questions  jsonb default '[]',
  version         int not null default 1,
  feedback        text,                  -- last "request changes" note
  slack_ts        text,
  slack_channel   text,
  shortlist_ts    text,                  -- Slack message that holds the shortlist buttons
  approved_by     text,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Candidates (one row per real person) + CV files (many per person)
-- ---------------------------------------------------------------------
create table if not exists rc_candidates (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  email          text,
  alt_emails     text[] not null default '{}',
  phone          text,
  phone_key      text,                   -- last 8 digits, used for duplicate detection
  location       text,
  headline       text,
  languages      jsonb not null default '[]',
  skills         jsonb not null default '[]',
  total_years    numeric,
  profile        jsonb not null default '{}',
  cv_text        text,
  embedding      vector(768),
  current_cv_id  uuid,
  needs_review   boolean not null default false,
  review_note    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists rc_candidates_email_idx on rc_candidates (lower(email));
create index if not exists rc_candidates_phone_idx on rc_candidates (phone_key);

create table if not exists rc_cv_files (
  id                 uuid primary key default gen_random_uuid(),
  candidate_id       uuid references rc_candidates(id) on delete set null,
  file_name          text not null,
  storage_path       text,
  mime_type          text,
  size_bytes         int,
  status             text not null default 'queued'
                     check (status in ('queued','processing','active','superseded','duplicate','unreadable','error')),
  status_reason      text,
  extraction_method  text,                -- pdf_text | docx_text | ocr_gemini
  extracted_text     text,
  text_hash          text,
  cv_date            date,                -- "last updated" date found in the CV, if any
  uploaded_at        timestamptz not null default now(),
  processed_at       timestamptz
);
alter table rc_roles add column if not exists shortlist_ts text;
alter table rc_candidates drop constraint if exists rc_candidates_current_cv_fk;
alter table rc_candidates add constraint rc_candidates_current_cv_fk
  foreign key (current_cv_id) references rc_cv_files(id) on delete set null;

-- ---------------------------------------------------------------------
-- Shortlists (top 5 per role), outreach sequences, events, tests
-- ---------------------------------------------------------------------
create table if not exists rc_shortlists (
  id                  uuid primary key default gen_random_uuid(),
  role_id             uuid not null references rc_roles(id) on delete cascade,
  candidate_id        uuid not null references rc_candidates(id) on delete cascade,
  cv_file_id          uuid references rc_cv_files(id) on delete set null,
  rank                int,
  score               int,
  reason              text,
  status              text not null default 'suggested'
                      check (status in ('suggested','approving','approved','skipped','error')),
  status_note         text,
  approved_by         text,
  approved_at         timestamptz,
  ghl_contact_id      text,
  ghl_opportunity_id  text,
  created_at          timestamptz not null default now(),
  unique (role_id, candidate_id)
);

create table if not exists rc_outreach (
  id                 uuid primary key default gen_random_uuid(),
  shortlist_id       uuid not null unique references rc_shortlists(id) on delete cascade,
  candidate_id       uuid not null references rc_candidates(id) on delete cascade,
  role_id            uuid not null references rc_roles(id) on delete cascade,
  to_email           text not null,
  status             text not null default 'active'
                     check (status in ('active','replied','no_response','stopped','error')),
  next_step          int not null default 1,       -- 1..3 = next email to send, 4 = all sent, waiting for reply
  next_send_at       timestamptz not null default now(),
  gmail_thread_id    text,
  last_message_id    text,                          -- RFC822 Message-ID of the last email we sent (for threading)
  sent_message_ids   text[] not null default '{}', -- Gmail ids of the emails WE sent
  last_sent_at       timestamptz,
  replied_at         timestamptz,
  ghl_contact_id     text,
  ghl_opportunity_id text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists rc_events (
  id          bigserial primary key,
  type        text not null,
  ref         text,
  message     text,
  data        jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists rc_test_questions (
  id           int primary key,
  question     text not null,
  expected     jsonb not null default '[]',
  expect_none  boolean not null default false,
  why          text,
  traps        text
);

create table if not exists rc_test_runs (
  id         bigserial primary key,
  run_at     timestamptz not null default now(),
  score      int not null,
  total      int not null,
  results    jsonb not null
);

-- Security: Row Level Security ON and no policies = nobody can read with the
-- public (anon/publishable) key. n8n and the portal use the secret key server-side.
alter table rc_settings        enable row level security;
alter table rc_roles           enable row level security;
alter table rc_candidates      enable row level security;
alter table rc_cv_files        enable row level security;
alter table rc_shortlists      enable row level security;
alter table rc_outreach        enable row level security;
alter table rc_events          enable row level security;
alter table rc_test_questions  enable row level security;
alter table rc_test_runs       enable row level security;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function rc_phone_key(p text) returns text
language sql immutable as $$
  select case when length(regexp_replace(coalesce(p,''), '\D', '', 'g')) >= 7
              then right(regexp_replace(p, '\D', '', 'g'), 8) end
$$;

create or replace function rc_norm_text(t text) returns text
language sql immutable as $$
  select trim(regexp_replace(lower(coalesce(t,'')), '[^[:alnum:]]+', ' ', 'g'))
$$;

-- Jaccard similarity of the word sets of two texts (0..1)
create or replace function rc_jaccard(a text, b text) returns numeric
language sql immutable as $$
  with wa as (select distinct w from unnest(string_to_array(rc_norm_text(a), ' ')) w where length(w) > 1),
       wb as (select distinct w from unnest(string_to_array(rc_norm_text(b), ' ')) w where length(w) > 1),
       i  as (select count(*) n from wa join wb using (w)),
       u  as (select count(*) n from (select w from wa union select w from wb) x)
  select case when (select n from u) = 0 then 0 else round((select n from i)::numeric / (select n from u), 4) end
$$;

create or replace function rc_name_key(n text) returns text
language sql immutable as $$
  -- first + last token, lower case, letters only (handles "Lina Khoury" vs "Lina Al-Khoury" partially)
  select lower(split_part(trim(coalesce(n,'')), ' ', 1)) || ' ' ||
         lower(regexp_replace(reverse(split_part(reverse(trim(coalesce(n,''))), ' ', 1)), '^(al-|el-)', ''))
$$;

create or replace function rc_log(p_type text, p_ref text, p_message text, p_data jsonb default null)
returns void language sql as $$
  insert into rc_events (type, ref, message, data) values (p_type, p_ref, p_message, p_data);
$$;

create or replace function rc_parse_cv_date(p text) returns date
language plpgsql immutable as $$
begin
  if p is null or p = '' or lower(p) = 'null' then return null; end if;
  if p ~ '^\d{4}-\d{2}$' then return (p || '-01')::date; end if;
  if p ~ '^\d{4}-\d{2}-\d{2}$' then return p::date; end if;
  return null;
exception when others then return null;
end $$;

-- ---------------------------------------------------------------------
-- rc_ingest_cv: THE duplicate / updated-CV rule, done atomically.
--   1. Same person = same email (incl. alternate emails) OR same phone (last 8 digits).
--   2. Same person + identical text, or ≥ 90% same words and no newer date → DUPLICATE (kept, linked, not searchable twice).
--   3. Same person + different CV → the one with the newer "last updated" date wins
--      (falls back to upload time when a CV has no date). The loser is SUPERSEDED.
--   4. No identity match but same name → new candidate, flagged "possible duplicate" for a human.
-- ---------------------------------------------------------------------
create or replace function rc_ingest_cv(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_file      rc_cv_files;
  v_prof      jsonb := coalesce(p->'profile', '{}'::jsonb);
  v_text      text  := coalesce(p->>'cv_text', '');
  v_email     text  := nullif(lower(trim(coalesce(v_prof->>'email',''))), '');
  v_phone     text  := nullif(trim(coalesce(v_prof->>'phone','')), '');
  v_pkey      text  := rc_phone_key(v_phone);
  v_name      text  := coalesce(nullif(trim(v_prof->>'full_name'),''), 'Unknown name');
  v_date      date  := rc_parse_cv_date(v_prof->>'cv_last_updated');
  v_hash      text  := md5(rc_norm_text(v_text));
  v_emb       vector(768);
  v_cand      rc_candidates;
  v_cur       rc_cv_files;
  v_sim       numeric;
  v_new_eff   timestamptz;
  v_cur_eff   timestamptz;
  v_action    text;
  v_msg       text;
  v_review    text := nullif(p->>'review_note', '');
  v_namematch rc_candidates;
begin
  select * into v_file from rc_cv_files where id = (p->>'file_id')::uuid for update;
  if not found then
    return jsonb_build_object('action','error','message','File record not found: ' || coalesce(p->>'file_id','null'));
  end if;

  if p ? 'embedding' and jsonb_typeof(p->'embedding') = 'array' and jsonb_array_length(p->'embedding') = 768 then
    v_emb := (p->>'embedding')::vector;
  end if;

  update rc_cv_files set extracted_text = v_text, text_hash = v_hash, cv_date = v_date,
         extraction_method = coalesce(p->>'extraction_method', extraction_method), processed_at = now()
   where id = v_file.id;

  -- 1. identity match
  select * into v_cand from rc_candidates c
   where (v_email is not null and (lower(c.email) = v_email or v_email = any(c.alt_emails)))
      or (v_pkey is not null and c.phone_key = v_pkey)
   order by (v_email is not null and lower(c.email) = v_email) desc, c.created_at
   limit 1;

  if not found then
    -- brand new person
    select * into v_namematch from rc_candidates c where rc_name_key(c.full_name) = rc_name_key(v_name) limit 1;
    if found then
      v_review := concat_ws(' · ', v_review, 'Possible duplicate of ' || v_namematch.full_name || ' (same name, different email/phone) — please check');
    end if;
    if v_email is null and v_pkey is null then
      v_review := concat_ws(' · ', v_review, 'No email or phone found in CV');
    end if;
    insert into rc_candidates (full_name, email, phone, phone_key, location, headline, languages, skills, total_years,
                               profile, cv_text, embedding, current_cv_id, needs_review, review_note)
    values (v_name, v_email, v_phone, v_pkey, v_prof->>'location', v_prof->>'headline',
            coalesce(v_prof->'languages','[]'), coalesce(v_prof->'skills','[]'),
            nullif(v_prof->>'total_years_experience','')::numeric, v_prof, v_text, v_emb, v_file.id,
            v_review is not null, v_review)
    returning * into v_cand;
    update rc_cv_files set candidate_id = v_cand.id, status = 'active', status_reason = 'New candidate' where id = v_file.id;
    perform rc_log('cv_created', v_cand.id::text, v_name || ' added from ' || v_file.file_name, null);
    return jsonb_build_object('action','created','candidate_id',v_cand.id,'candidate_name',v_name,
      'file_status','active','needs_review', v_review is not null, 'review_note', v_review,
      'message', 'New candidate ' || v_name || ' added' || coalesce(' — ⚠ ' || v_review, ''));
  end if;

  -- 2./3. existing person: compare with their current CV
  select * into v_cur from rc_cv_files where id = v_cand.current_cv_id;
  if v_email is not null and lower(coalesce(v_cand.email,'')) <> v_email and not (v_email = any(v_cand.alt_emails)) then
    update rc_candidates set alt_emails = array_append(alt_emails, v_email) where id = v_cand.id;
  end if;

  v_sim := case when v_cur.id is null then 0 else rc_jaccard(v_text, v_cur.extracted_text) end;
  v_new_eff := coalesce(v_date::timestamptz, v_file.uploaded_at);
  v_cur_eff := coalesce(v_cur.cv_date::timestamptz, v_cur.uploaded_at, '-infinity'::timestamptz);

  if v_cur.id is not null and v_cur.text_hash = v_hash then
    -- exact same content: nothing changes
    v_action := 'duplicate';
    update rc_cv_files set candidate_id = v_cand.id, status = 'duplicate',
      status_reason = 'Exact copy of "' || v_cur.file_name || '"' ||
                      case when v_email is not null and lower(coalesce(v_cand.email,'')) <> v_email then ' — different email, matched on phone' else '' end
     where id = v_file.id;
    v_msg := 'Duplicate of ' || v_cand.full_name || '''s CV "' || v_cur.file_name || '" — kept once, not added again';
  elsif v_new_eff >= v_cur_eff then
    -- newer (by CV date, or by upload time when there is no date) → becomes the current CV
    v_action := case when v_sim >= 0.80 and (v_date is null or v_cur.cv_date is null or v_date = v_cur.cv_date)
                     then 'duplicate' else 'updated' end;
    update rc_cv_files set status = case when v_action = 'duplicate' then 'duplicate' else 'superseded' end,
      status_reason = case when v_action = 'duplicate'
                           then 'Same CV as "' || v_file.file_name || '" (' || round(v_sim*100) || '% identical) — newest copy kept'
                           else 'Replaced by newer CV "' || v_file.file_name || '"' || coalesce(' dated ' || to_char(v_date,'Mon YYYY'), ' (uploaded later)') end
     where id = v_cur.id;
    update rc_cv_files set candidate_id = v_cand.id, status = 'active',
      status_reason = case when v_action = 'duplicate'
                           then 'Same person as "' || coalesce(v_cur.file_name,'?') || '" (' || round(v_sim*100) || '% identical' ||
                                case when v_email is not null and lower(coalesce(v_cand.email,'')) <> v_email then ', different email — matched on phone' else '' end || ')'
                           else 'Newer version — replaced "' || coalesce(v_cur.file_name,'?') || '"' end
     where id = v_file.id;
    update rc_candidates set full_name = case when v_action = 'duplicate' then full_name else v_name end, phone = coalesce(v_phone, phone), phone_key = coalesce(v_pkey, phone_key),
      location = coalesce(v_prof->>'location', location), headline = v_prof->>'headline',
      languages = coalesce(v_prof->'languages','[]'), skills = coalesce(v_prof->'skills','[]'),
      total_years = nullif(v_prof->>'total_years_experience','')::numeric, profile = v_prof, cv_text = v_text,
      embedding = coalesce(v_emb, embedding), current_cv_id = v_file.id,
      needs_review = (v_review is not null), review_note = v_review, updated_at = now()
     where id = v_cand.id;
    v_msg := case when v_action = 'duplicate'
                  then 'Duplicate of ' || v_cand.full_name || '''s CV "' || coalesce(v_cur.file_name,'?') || '" (' || round(v_sim*100) || '% identical) — kept once, newest copy used'
                  else v_cand.full_name || '''s CV updated: "' || v_file.file_name || '" replaces "' || coalesce(v_cur.file_name,'?') || '"' end;
  else
    v_action := 'older_version';
    update rc_cv_files set candidate_id = v_cand.id, status = 'superseded',
      status_reason = 'Older than the current CV "' || v_cur.file_name || '"' || coalesce(' (dated ' || to_char(v_cur.cv_date,'Mon YYYY') || ')', '')
     where id = v_file.id;
    v_msg := 'Older version of ' || v_cand.full_name || '''s CV — kept the newer "' || v_cur.file_name || '"';
  end if;

  perform rc_log('cv_' || v_action, v_cand.id::text, v_msg, jsonb_build_object('file', v_file.file_name, 'similarity', v_sim));
  return jsonb_build_object('action', v_action, 'candidate_id', v_cand.id, 'candidate_name', v_cand.full_name,
    'file_status', (select status from rc_cv_files where id = v_file.id), 'similarity', v_sim, 'message', v_msg,
    'needs_review', v_review is not null, 'review_note', v_review);
end $$;

-- Mark a file as unreadable / error (never silently skipped)
create or replace function rc_flag_file(p_file_id uuid, p_status text, p_reason text) returns jsonb
language plpgsql as $$
declare v_name text;
begin
  update rc_cv_files set status = p_status, status_reason = p_reason, processed_at = now()
   where id = p_file_id returning file_name into v_name;
  perform rc_log('cv_flagged', p_file_id::text, coalesce(v_name,'?') || ': ' || p_reason, null);
  return jsonb_build_object('action','flagged','file_status',p_status,'file_name',v_name,'message','⚠ ' || coalesce(v_name,'?') || ' flagged: ' || p_reason);
end $$;

-- ---------------------------------------------------------------------
-- Hybrid search: vector similarity UNION keyword hits, current CVs only.
-- Returns the pool that the AI judge scores. Never returns superseded/duplicate files.
-- ---------------------------------------------------------------------
create or replace function rc_search_candidates(query_embedding text default null, keywords text[] default '{}', match_count int default 25)
returns table (candidate_id uuid, full_name text, similarity float, keyword_hits int, profile jsonb,
               cv_text text, cv_file_id uuid, cv_file_name text, needs_review boolean, review_note text)
language plpgsql stable as $$
declare v_q vector(768);
begin
  if query_embedding is not null and query_embedding <> '' then v_q := query_embedding::vector; end if;
  return query
  with kw as (
    select distinct lower(trim(k)) k from unnest(coalesce(keywords,'{}')) k where length(trim(k)) >= 2
  ), base as (
    select c.id, c.full_name,
           case when v_q is null or c.embedding is null then 0::float else 1 - (c.embedding <=> v_q) end as sim,
           (select count(*) from kw where c.cv_text ilike '%' || replace(replace(kw.k,'%','\%'),'_','\_') || '%')::int as hits,
           c.profile, c.cv_text, f.id as fid, f.file_name, c.needs_review, c.review_note
      from rc_candidates c
      join rc_cv_files f on f.id = c.current_cv_id and f.status = 'active'
  ), pool as (
    (select b.id from base b order by b.sim desc limit match_count)
    union
    (select b.id from base b where b.hits > 0 order by b.hits desc, b.sim desc limit match_count)
  )
  select b.id, b.full_name, b.sim, b.hits, b.profile, b.cv_text, b.fid, b.file_name, b.needs_review, b.review_note
    from base b where b.id in (select id from pool)
   order by b.hits desc, b.sim desc;
end $$;

-- ---------------------------------------------------------------------
-- Shortlists
-- ---------------------------------------------------------------------
create or replace function rc_save_shortlist(p_role_id uuid, p_items jsonb) returns jsonb
language plpgsql as $$
declare it jsonb;
begin
  -- drop old suggestions that were never acted on; keep anything already approved/skipped
  delete from rc_shortlists where role_id = p_role_id and status = 'suggested'
     and candidate_id not in (select (x->>'candidate_id')::uuid from jsonb_array_elements(p_items) x);
  for it in select * from jsonb_array_elements(p_items) loop
    insert into rc_shortlists (role_id, candidate_id, cv_file_id, rank, score, reason)
    values (p_role_id, (it->>'candidate_id')::uuid, nullif(it->>'cv_file_id','')::uuid,
            (it->>'rank')::int, (it->>'score')::int, it->>'reason')
    on conflict (role_id, candidate_id) do update
      set rank = excluded.rank, score = excluded.score, reason = excluded.reason, cv_file_id = excluded.cv_file_id
      where rc_shortlists.status = 'suggested';
  end loop;
  perform rc_log('shortlist_saved', p_role_id::text, jsonb_array_length(p_items) || ' candidates shortlisted', null);
  return rc_get_shortlist(p_role_id);
end $$;

create or replace function rc_get_shortlist(p_role_id uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'role', (select jsonb_build_object('id', r.id, 'code', r.code, 'title', r.title, 'client_name', r.client_name,
                    'status', r.status, 'slack_ts', r.slack_ts, 'slack_channel', r.slack_channel, 'shortlist_ts', r.shortlist_ts,
                    'must_haves', r.must_haves) from rc_roles r where r.id = p_role_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'shortlist_id', s.id, 'rank', s.rank, 'score', s.score, 'reason', s.reason, 'status', s.status,
        'status_note', s.status_note, 'approved_by', s.approved_by, 'candidate_id', c.id, 'full_name', c.full_name,
        'location', c.location, 'headline', c.headline, 'cv_file_name', f.file_name, 'cv_file_id', f.id,
        'needs_review', c.needs_review, 'outreach_status', o.status) order by s.rank)
      from rc_shortlists s join rc_candidates c on c.id = s.candidate_id
      left join rc_cv_files f on f.id = s.cv_file_id
      left join rc_outreach o on o.shortlist_id = s.id
      where s.role_id = p_role_id), '[]'::jsonb))
$$;

-- Step 1 of approval: atomically claim the row so a double-click can't contact someone twice
create or replace function rc_claim_shortlist(p_shortlist_id uuid, p_user text) returns jsonb
language plpgsql as $$
declare s rc_shortlists; c rc_candidates; r rc_roles;
begin
  update rc_shortlists set status = 'approving', approved_by = p_user
   where id = p_shortlist_id and status in ('suggested','error') returning * into s;
  if not found then
    select * into s from rc_shortlists where id = p_shortlist_id;
    return jsonb_build_object('claimed', false, 'status', s.status, 'approved_by', s.approved_by, 'role_id', s.role_id);
  end if;
  select * into c from rc_candidates where id = s.candidate_id;
  select * into r from rc_roles where id = s.role_id;
  if r.status <> 'open' then
    update rc_shortlists set status = 'suggested', approved_by = null where id = s.id;
    return jsonb_build_object('claimed', false, 'status', 'role_not_open', 'role_id', s.role_id);
  end if;
  return jsonb_build_object('claimed', true, 'shortlist_id', s.id, 'role_id', r.id, 'role_code', r.code, 'role_title', r.title,
    'client_name', r.client_name, 'candidate_id', c.id, 'full_name', c.full_name, 'email', c.email, 'phone', c.phone,
    'location', c.location, 'reason', s.reason, 'score', s.score);
end $$;

-- Step 2 of approval: after GHL succeeded, start the email sequence
create or replace function rc_start_outreach(p_shortlist_id uuid, p_to_email text, p_contact text, p_opp text) returns jsonb
language plpgsql as $$
declare s rc_shortlists; o rc_outreach;
begin
  update rc_shortlists set status = 'approved', approved_at = now(), ghl_contact_id = p_contact,
         ghl_opportunity_id = p_opp, status_note = null
   where id = p_shortlist_id returning * into s;
  insert into rc_outreach (shortlist_id, candidate_id, role_id, to_email, ghl_contact_id, ghl_opportunity_id)
  values (s.id, s.candidate_id, s.role_id, p_to_email, p_contact, p_opp)
  on conflict (shortlist_id) do nothing returning * into o;
  perform rc_log('candidate_approved', s.candidate_id::text, 'Approved by ' || coalesce(s.approved_by,'?') || ' — outreach started', null);
  return jsonb_build_object('ok', true, 'outreach_id', o.id, 'role_id', s.role_id);
end $$;

create or replace function rc_fail_shortlist(p_shortlist_id uuid, p_note text) returns jsonb
language plpgsql as $$
declare s rc_shortlists;
begin
  update rc_shortlists set status = 'error', status_note = p_note where id = p_shortlist_id returning * into s;
  perform rc_log('approval_failed', p_shortlist_id::text, p_note, null);
  return jsonb_build_object('ok', false, 'role_id', s.role_id);
end $$;

create or replace function rc_skip_shortlist(p_shortlist_id uuid, p_user text) returns jsonb
language plpgsql as $$
declare s rc_shortlists;
begin
  update rc_shortlists set status = 'skipped', approved_by = p_user
   where id = p_shortlist_id and status in ('suggested','error') returning * into s;
  if not found then select * into s from rc_shortlists where id = p_shortlist_id; end if;
  return jsonb_build_object('ok', true, 'role_id', s.role_id);
end $$;

-- ---------------------------------------------------------------------
-- Outreach engine
-- ---------------------------------------------------------------------
create or replace function rc_setting(p_key text) returns text
language sql stable as $$ select value from rc_settings where key = p_key $$;

create or replace function rc_outreach_work() returns jsonb
language plpgsql as $$
declare v_items jsonb; v_got int;
begin
  -- simple lock so the 2-minute schedule and the "run now" webhook never email the same person twice
  insert into rc_settings (key, value, description) values ('engine_lock_until', '', 'internal: outreach engine lock')
  on conflict (key) do nothing;
  update rc_settings set value = (now() + interval '90 seconds')::text
   where key = 'engine_lock_until' and (value = '' or value::timestamptz < now());
  get diagnostics v_got = row_count;
  if v_got = 0 then return jsonb_build_object('locked', true, 'items', '[]'::jsonb); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'outreach_id', o.id, 'to_email', o.to_email, 'next_step', o.next_step, 'due', o.next_send_at <= now(),
    'gmail_thread_id', o.gmail_thread_id, 'last_message_id', o.last_message_id, 'sent_message_ids', to_jsonb(o.sent_message_ids),
    'ghl_opportunity_id', o.ghl_opportunity_id, 'candidate_name', c.full_name,
    'first_name', split_part(c.full_name, ' ', 1), 'role_title', r.title, 'role_code', r.code,
    'client_name', r.client_name, 'reason', s.reason,
    'role_summary', coalesce(r.jd->>'summary', ''), 'location', coalesce(r.jd->>'location_hours','Remote'),
    'compensation', coalesce(r.jd->>'compensation','')) order by o.next_send_at), '[]'::jsonb)
  into v_items
  from rc_outreach o join rc_candidates c on c.id = o.candidate_id join rc_roles r on r.id = o.role_id
  join rc_shortlists s on s.id = o.shortlist_id
  where o.status = 'active' and (o.next_send_at <= now() or o.gmail_thread_id is not null);
  return jsonb_build_object('locked', false, 'items', v_items);
end $$;

create or replace function rc_outreach_sent(p_id uuid, p_gmail_id text, p_thread_id text, p_message_id text) returns jsonb
language plpgsql as $$
declare o rc_outreach; delays int[]; v_next int; v_wait int;
begin
  delays := string_to_array(regexp_replace(coalesce(rc_setting('sequence_delays_minutes'),'0,10,20'), '\s', '', 'g'), ',')::int[];
  select * into o from rc_outreach where id = p_id;
  v_next := o.next_step + 1;
  v_wait := case when v_next <= coalesce(array_length(delays,1),3) then delays[v_next]
                 else coalesce(rc_setting('final_wait_minutes'),'30')::int end;
  update rc_outreach set
    sent_message_ids = array_append(sent_message_ids, p_gmail_id),
    gmail_thread_id = coalesce(gmail_thread_id, p_thread_id),
    last_message_id = coalesce(nullif(p_message_id,''), last_message_id),
    last_sent_at = now(), next_step = v_next, next_send_at = now() + make_interval(mins => v_wait), updated_at = now()
  where id = p_id returning * into o;
  perform rc_log('email_sent', o.candidate_id::text, 'Outreach email ' || (o.next_step - 1) || ' sent to ' || o.to_email, null);
  return jsonb_build_object('ok', true, 'next_step', o.next_step, 'next_send_at', o.next_send_at);
end $$;

create or replace function rc_outreach_set_status(p_id uuid, p_status text, p_note text default null) returns jsonb
language plpgsql as $$
declare o rc_outreach;
begin
  update rc_outreach set status = p_status, replied_at = case when p_status = 'replied' then now() else replied_at end,
         updated_at = now()
   where id = p_id and status = 'active' returning * into o;
  if not found then return jsonb_build_object('ok', false); end if;
  perform rc_log('outreach_' || p_status, o.candidate_id::text, coalesce(p_note, 'Sequence ' || p_status), null);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- Roles / JD lifecycle
-- ---------------------------------------------------------------------
create or replace function rc_role_json(r rc_roles) returns jsonb
language sql stable as $$
  select to_jsonb(r) - 'transcript' || jsonb_build_object('transcript', left(r.transcript, 30000))
$$;

-- New role from call notes, or fetch an existing role for a revision
create or replace function rc_jd_context(p jsonb) returns jsonb
language plpgsql as $$
declare r rc_roles;
begin
  if nullif(p->>'role_id','') is not null then
    select * into r from rc_roles where id = (p->>'role_id')::uuid;
    if not found then return jsonb_build_object('error','Role not found'); end if;
    update rc_roles set status = 'drafting', feedback = coalesce(nullif(p->>'feedback',''), feedback), updated_at = now()
     where id = r.id returning * into r;
    return rc_role_json(r) || jsonb_build_object('is_revision', true);
  end if;
  if length(coalesce(p->>'transcript','')) < 80 then
    return jsonb_build_object('error','The call notes are too short to write a job description (need at least a few sentences).');
  end if;
  insert into rc_roles (transcript, client_name, client_email, title, status)
  values (p->>'transcript', nullif(p->>'client_name',''), nullif(p->>'client_email',''),
          coalesce(nullif(p->>'title_hint',''), 'New role (drafting…)'), 'drafting')
  returning * into r;
  perform rc_log('role_created', r.id::text, 'Call notes received for ' || coalesce(r.client_name,'unknown client'), null);
  return rc_role_json(r) || jsonb_build_object('is_revision', false);
end $$;

create or replace function rc_save_jd(p jsonb) returns jsonb
language plpgsql as $$
declare r rc_roles;
begin
  update rc_roles set
    jd = p->'jd', jd_markdown = p->>'jd_markdown', title = coalesce(nullif(p->>'title',''), title),
    client_name = coalesce(client_name, nullif(p->>'client_name','')),
    client_contact = coalesce(client_contact, nullif(p->>'client_contact','')),
    client_email = coalesce(client_email, nullif(p->>'client_email','')),
    must_haves = coalesce(p->'must_haves','[]'), nice_to_haves = coalesce(p->'nice_to_haves','[]'),
    open_questions = coalesce(p->'open_questions','[]'),
    version = case when jd is null then 1 else version + 1 end,
    status = 'pending_approval', updated_at = now()
  where id = (p->>'role_id')::uuid returning * into r;
  perform rc_log('jd_drafted', r.id::text, 'JD v' || r.version || ' for ' || r.title || ' sent to Slack for approval', null);
  return rc_role_json(r);
end $$;

create or replace function rc_set_role_slack(p_role_id uuid, p_ts text, p_channel text, p_kind text default 'jd') returns jsonb
language plpgsql as $$
begin
  if p_kind = 'shortlist' then
    update rc_roles set shortlist_ts = p_ts, slack_channel = coalesce(p_channel, slack_channel) where id = p_role_id;
  else
    update rc_roles set slack_ts = p_ts, slack_channel = p_channel where id = p_role_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Recruiter decision on a JD (idempotent: only a pending JD can be decided)
create or replace function rc_jd_decision(p_role_id uuid, p_decision text, p_user text, p_feedback text default null) returns jsonb
language plpgsql as $$
declare r rc_roles; v_prev text;
begin
  select * into r from rc_roles where id = p_role_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'Role not found'); end if;
  v_prev := r.status;
  if r.status <> 'pending_approval' then
    return jsonb_build_object('ok', false, 'reason', 'Already ' || r.status || coalesce(' by ' || r.approved_by, ''), 'role', rc_role_json(r));
  end if;
  update rc_roles set
    status = case p_decision when 'approve' then 'open' when 'reject' then 'rejected' else 'changes_requested' end,
    approved_by = case when p_decision = 'approve' then p_user else approved_by end,
    approved_at = case when p_decision = 'approve' then now() else approved_at end,
    feedback = case when p_decision = 'changes' then p_feedback else feedback end,
    updated_at = now()
  where id = p_role_id returning * into r;
  perform rc_log('jd_' || p_decision, r.id::text, r.title || ': ' ||
    case p_decision when 'approve' then 'JD approved' when 'reject' then 'JD rejected' else 'changes requested' end ||
    ' by ' || p_user || coalesce(' — “' || p_feedback || '”', ''), null);
  return jsonb_build_object('ok', true, 'previous', v_prev, 'role', rc_role_json(r));
end $$;

-- What the search workflow needs to know about a role (null when searching ad hoc)
create or replace function rc_role_brief(p_role_id uuid default null) returns jsonb
language sql stable as $$
  select case when p_role_id is null then jsonb_build_object('role', null)
    else (select jsonb_build_object('role', jsonb_build_object('id', r.id, 'code', r.code, 'title', r.title, 'status', r.status,
            'client_name', r.client_name, 'must_haves', r.must_haves, 'nice_to_haves', r.nice_to_haves,
            'summary', r.jd->>'summary', 'shortlist_ts', r.shortlist_ts, 'slack_channel', r.slack_channel))
          from rc_roles r where r.id = p_role_id) end
$$;

-- Search wrapper that always returns ONE json object (an empty pool is still a valid answer)
create or replace function rc_search(p jsonb) returns jsonb
language sql stable as $$
  select jsonb_build_object('pool', coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb),
         'total_candidates', (select count(*) from rc_candidates c join rc_cv_files f on f.id = c.current_cv_id and f.status = 'active'))
  from rc_search_candidates(nullif(p->>'query_embedding',''),
       coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(p->'keywords','[]'::jsonb))), '{}'),
       coalesce((p->>'match_count')::int, 25)) x
$$;

-- CV file processing start (returns the file row; marks it processing)
create or replace function rc_begin_file(p_file_id uuid) returns jsonb
language plpgsql as $$
declare f rc_cv_files;
begin
  update rc_cv_files set status = 'processing', status_reason = null where id = p_file_id returning * into f;
  if not found then return jsonb_build_object('error', 'File not found'); end if;
  return to_jsonb(f) - 'extracted_text';
end $$;

-- Save several settings at once (used by the Setup workflow)
create or replace function rc_set_settings(p jsonb) returns jsonb
language plpgsql as $$
declare k text; v text;
begin
  for k, v in select key, value from jsonb_each_text(p) loop
    insert into rc_settings (key, value) values (k, v) on conflict (key) do update set value = excluded.value;
  end loop;
  return jsonb_build_object('ok', true, 'saved', (select jsonb_agg(key) from jsonb_object_keys(p) key));
end $$;

-- ---------------------------------------------------------------------
-- Views for the portal
-- ---------------------------------------------------------------------
create or replace view rc_v_files as
  select f.id, f.file_name, f.status, f.status_reason, f.extraction_method, f.cv_date, f.uploaded_at, f.processed_at,
         f.storage_path, f.candidate_id, c.full_name as candidate_name
    from rc_cv_files f left join rc_candidates c on c.id = f.candidate_id;

create or replace view rc_v_shortlist as
  select s.id, s.role_id, s.rank, s.score, s.reason, s.status, s.status_note, s.approved_by, s.approved_at,
         s.ghl_opportunity_id, c.id as candidate_id, c.full_name, c.location, c.headline, c.needs_review, c.review_note,
         f.id as cv_file_id, f.file_name as cv_file_name, f.storage_path as cv_storage_path,
         o.status as outreach_status, o.next_step as outreach_next_step, o.to_email as outreach_email
    from rc_shortlists s join rc_candidates c on c.id = s.candidate_id
    left join rc_cv_files f on f.id = s.cv_file_id
    left join rc_outreach o on o.shortlist_id = s.id;

-- ---------------------------------------------------------------------
-- Storage bucket for CV files (private). Skipped automatically outside Supabase.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('cvs', 'cvs', false) on conflict (id) do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Test questions (the 10 questions shown on the portal Test page)
-- ---------------------------------------------------------------------
insert into rc_test_questions (id, question, expected, expect_none, why, traps) values
 (1,'Who has 3+ years of GHL and speaks Arabic?','["Omar Haddad","Lina Khoury","Youssef Benali","Ahmed Farouk"]',false,
  'Youssef only qualifies on his UPDATED Oct-2026 CV (old CV = ~2 yrs GHL). Lina sent her CV twice (name variant) and must appear once.',
  'Karim Mansour (Arabic, only ~1.5 yrs GHL), Hana Saleh (Arabic, GHL course only), Sofia Petrova / Thabo Nkosi / Daniel Okafor (3+ yrs GHL, no Arabic)'),
 (2,'Bilingual Spanish/English support agents who have used Gorgias','["Valentina Rojas","Diego Herrera","Lucía Fernández"]',false,
  'Lucía sent the same CV as PDF and Word and must appear once.',
  'Ana Ribeiro (Gorgias, no Spanish), Camila Torres and Javier Morales (Spanish support, no Gorgias)'),
 (3,'Which bookkeepers are certified QuickBooks Online ProAdvisors?','["Patricia Reyes","Samir Aziz"]',false,
  'Only these two hold the certification.','Fatima Zahra El Idrissi is only preparing for the exam'),
 (4,'React + TypeScript developers with at least 4 years who have also worked with PostgreSQL','["Andrei Ionescu","Mateo Silva","Nour Hamdan"]',false,
  'Mateo sent two CVs with different emails (same phone) and must appear once.',
  'Oksana Kovalenko (no Postgres), Bilal Qureshi (3/2 yrs), Kwame Mensah (1 yr React, no TS), Yaroslav Melnyk (React Native, no Postgres), Sara Mahmoud (QA, 3 yrs TS)'),
 (5,'Who has managed Meta ads budgets of more than $20k per month?','["Isabella Cruz","Zainab Bello"]',false,
  '$45k/month and $25k/month.','Valeria Gómez ($18k), Rania Ezzat ($30k but Google Ads), Lerato Khumalo ($200k TOTAL over 3 years), Arjun Mehta ($12k), Pedro Alves ($8k)'),
 (6,'Candidates based in the Philippines with Xero experience','["Patricia Reyes","Rhea Mendoza"]',false,
  'Rhea''s CV is the scanned, image-only PDF: she is only findable if OCR worked.',
  'Jun Bautista (Philippines, QBO only), Elena Popescu / Nomvula Dlamini / Grace Lim (Xero, not Philippines)'),
 (7,'Who has built HIPAA-compliant software?','["Andrei Ionescu","Kwame Mensah"]',false,
  'Telehealth platform and EHR integrations.','Mark Villanueva only did HIPAA awareness training as a billing agent'),
 (8,'French-speaking e-commerce customer support candidates','["Amélie Laurent","Kevin Mwangi"]',false,
  'Kevin only speaks French on his UPDATED Sep-2026 CV.',
  'Nadia Belkacem (French, telecom support not e-commerce), Omar Haddad / Youssef Benali / Fatima Zahra El Idrissi (French, not support)'),
 (9,'Who has SAP S/4HANA experience?','[]',true,'Nobody. The bot must say so instead of inventing someone.',
  'Tariq Hassan has SAP Business One, which is a different product'),
 (10,'Who has 10+ years of GoHighLevel experience?','[]',true,'Nobody — the most is ~7.5 years.',
  'Daniel Okafor says ''10+ years in marketing automation'' but only 7 on GHL')
on conflict (id) do update set question = excluded.question, expected = excluded.expected,
  expect_none = excluded.expect_none, why = excluded.why, traps = excluded.traps;

-- ---------------------------------------------------------------------
-- Permissions: only the server-side secret key (service_role) may use these tables/functions.
-- The public anon key gets nothing (RLS has no policies and functions are not executable by anon).
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public to service_role;
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
    for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname like 'rc\_%' loop
      execute format('revoke execute on function %s from public', f.sig);
      execute format('grant execute on function %s to service_role', f.sig);
      if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke execute on function %s from anon', f.sig); end if;
      if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke execute on function %s from authenticated', f.sig); end if;
    end loop;
  end if;
end $$;
