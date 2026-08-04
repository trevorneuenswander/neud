-- Reconcile canonical platform Owner and Admin roles for known NEUD accounts.
-- Owner: trevorneuenswander@gmail.com
-- Team-scoped Admin: trevor@hildrethmedia.com (profiles.role = admin, not owner)

UPDATE public.profiles
SET role = 'admin', updated_at = now()
WHERE role = 'owner'
  AND id IN (
    SELECT id
    FROM auth.users
    WHERE lower(trim(email)) = 'trevor@hildrethmedia.com'
  );

UPDATE public.profiles
SET role = 'owner', updated_at = now()
WHERE id IN (
  SELECT id
  FROM auth.users
  WHERE lower(trim(email)) = 'trevorneuenswander@gmail.com'
);

-- Ensure no account other than the canonical Owner retains global owner role.
UPDATE public.profiles
SET role = 'admin', updated_at = now()
WHERE role = 'owner'
  AND id NOT IN (
    SELECT id
    FROM auth.users
    WHERE lower(trim(email)) = 'trevorneuenswander@gmail.com'
  );
