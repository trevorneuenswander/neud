import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function findAuthUserIdByEmail(
  email: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const normalizedEmail = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error || !data.users.length) {
      return null;
    }

    const match = data.users.find(
      (user) => user.email?.toLowerCase() === normalizedEmail,
    );

    if (match) {
      return match.id;
    }

    if (data.users.length < perPage) {
      return null;
    }

    page += 1;
  }

  return null;
}
