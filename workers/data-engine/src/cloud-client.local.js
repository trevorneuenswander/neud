export function getSupabase() {
  throw new Error(
    "Remote Supabase access is not available in the NEUD local Data Engine worker. " +
      "The packaged desktop worker communicates only through NEUD_LOCAL_API_URL.",
  );
}
