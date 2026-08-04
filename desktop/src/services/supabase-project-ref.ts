export function extractSupabaseProjectRef(supabaseUrl: string): string | null {
  try {
    const hostname = new URL(supabaseUrl).hostname;
    const ref = hostname.split(".")[0]?.trim();
    return ref || null;
  } catch {
    return null;
  }
}

export function logSupabaseProjectDiagnostics(input: {
  authProjectRef: string | null;
  profileProjectRef: string | null;
  accessProjectRef: string | null;
}): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info(
    `[identity-resolution] Supabase auth project: ${input.authProjectRef ?? "unknown"} | profile project: ${input.profileProjectRef ?? "unknown"} | access project: ${input.accessProjectRef ?? "unknown"}`,
  );

  const refs = [input.authProjectRef, input.profileProjectRef, input.accessProjectRef].filter(
    Boolean,
  );
  const unique = new Set(refs);
  if (unique.size > 1) {
    console.warn("[identity-resolution] Supabase project reference mismatch detected.");
  }
}
