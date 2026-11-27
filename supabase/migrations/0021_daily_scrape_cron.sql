-- 0021_daily_scrape_cron.sql
-- Start the daily scrape on time. GitHub's own `schedule:` trigger often fires hours
-- late (the first run was 10.5 hours late), so Supabase dispatches the scraper workflow
-- at 12:00 IST (06:30 UTC) itself. The GitHub schedule stays as a backup; a second run
-- only picks up SKUs not yet scraped since noon.
--
-- One-time setup after applying (SQL editor), using a GitHub token that can run
-- workflows on souravsumansourav-netizen/scrapper-p (the same token as the
-- trigger-scrape Edge Function's GITHUB_TOKEN secret):
--   select vault.create_secret('<github token>', 'github_scraper_token');

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.dispatch_daily_scrape()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  token text;
  request_id bigint;
begin
  select decrypted_secret into token
  from vault.decrypted_secrets
  where name = 'github_scraper_token'
  limit 1;

  if token is null then
    raise warning 'dispatch_daily_scrape: vault secret github_scraper_token is missing; daily scrape not dispatched';
    return null;
  end if;

  select net.http_post(
    url := 'https://api.github.com/repos/souravsumansourav-netizen/scrapper-p/actions/workflows/scrape_skus.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'Content-Type', 'application/json',
      'User-Agent', 'creative-portal-cron'
    ),
    body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('mode', 'daily', 'use_browser', 'true'))
  ) into request_id;

  return request_id;
end;
$$;

-- Only the scheduler (and admins via SQL) may call it.
revoke all on function public.dispatch_daily_scrape() from public, anon, authenticated;

-- Replace any earlier version of the job, then schedule 06:30 UTC = 12:00 IST daily.
select cron.unschedule(jobid) from cron.job where jobname = 'daily-scrape-noon-ist';
select cron.schedule('daily-scrape-noon-ist', '30 6 * * *', $$select public.dispatch_daily_scrape()$$);
