-- Sign-up role choice. The sign-up form sends `requested_role` in the user metadata; it is validated here against
-- a whitelist, so nobody can ask for 'admin' (or anything unknown) from the browser. Admin and approver are only ever
-- granted by an existing admin on the Users page. The very first account in an empty project is still bootstrapped as admin.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare requested text := new.raw_user_meta_data->>'requested_role';
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    case
      when (select count(*) from profiles) = 0 then 'admin'::role_enum
      when requested in ('uploader', 'creator', 'pdp_uploader', 'performance') then requested::role_enum
      else 'creator'::role_enum
    end
  );
  return new;
end $$;
