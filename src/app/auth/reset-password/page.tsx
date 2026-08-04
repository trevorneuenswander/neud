import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { PASSWORD_RESET_INVALID_LINK_MESSAGE } from "@/lib/auth/password-reset/messages";
import { validatePasswordResetToken } from "@/lib/auth/password-reset/service";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";
  const validation = token
    ? await validatePasswordResetToken(token)
    : { status: "invalid" as const };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Reset Password
      </h1>

      {validation.status === "valid" ? (
        <>
          <p className="mt-3 text-sm leading-6 text-muted">
            Choose a new password for your account.
          </p>
          <div className="mt-6">
            <ResetPasswordForm token={token} />
          </div>
        </>
      ) : (
        <div className="mt-6 space-y-4">
          <Alert variant="error">{PASSWORD_RESET_INVALID_LINK_MESSAGE}</Alert>
          <Button href="/forgot-password" className="w-full">
            Request a new reset email
          </Button>
          <p className="text-center text-sm text-muted">
            <Link
              href="/"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Return to Sign In
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
