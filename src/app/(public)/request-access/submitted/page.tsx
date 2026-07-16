import Link from "next/link";
import { PublicPage } from "@/components/layout/PublicPage";

export default function RequestAccessSubmittedPage() {
  return (
    <PublicPage
      title="Request received"
      description="Thank you for your interest in HMG Graphics Server. Your request has been submitted for review."
    >
      <p className="text-sm leading-6 text-muted">
        Submitting a request does not grant immediate access. If your request is
        approved, you will receive an email invitation to create your account
        and set a password.
      </p>
      <p className="mt-6">
        <Link
          href="/"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to home
        </Link>
      </p>
    </PublicPage>
  );
}
