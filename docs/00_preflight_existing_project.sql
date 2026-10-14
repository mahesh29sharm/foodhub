-- READ ONLY. Run in your EXISTING Supabase project before applying the migration.
-- If any rows appear, investigate the existing fd_ objects; do not overwrite or rename blindly.

select n.nspname as schema_name, c.relname as object_name, c.relkind as kind
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and left(c.relname, 3) = 'fd_'
order by 1, 2;

select n.nspname as schema_name, p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and left(p.proname, 3) = 'fd_'
order by 1, 2;

select id, name from storage.buckets where id = 'fd-dish-images';
