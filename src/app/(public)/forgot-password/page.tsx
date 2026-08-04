import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { PublicPage } from "@/components/layout/PublicPage";
import { Alert } from "@/components/ui/Alert";
import { getPageMessage } from "@/lib/auth/messages";

type ForgotPasswordPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const params = await searchParams;
  const errorMessage = getPageMessage(params.error);

  return (
    <PublicPage
      title="Reset Password"
      description="Enter the email address associated with your account. If an account exists, we'll send you instructions to reset your password."
    >
      {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
      <div className={errorMessage ? "mt-4" : ""}>
        <ForgotPasswordForm />
      </div>
    </PublicPage>
  );
}
