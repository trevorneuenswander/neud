import { ConfirmHashClient } from "@/components/auth/ConfirmHashClient";
import { handleAuthConfirm } from "@/lib/auth/confirm-handler";
import type { ConfirmSearchParams } from "@/lib/auth/confirm-shared";

type AuthConfirmPageProps = {
  searchParams: Promise<ConfirmSearchParams>;
};

export default async function AuthConfirmPage({
  searchParams,
}: AuthConfirmPageProps) {
  const params = await searchParams;
  const result = await handleAuthConfirm(params);

  if (result.kind === "client-hash") {
    return <ConfirmHashClient next={result.next} />;
  }

  return null;
}
