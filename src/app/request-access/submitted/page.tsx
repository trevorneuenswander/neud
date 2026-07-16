import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";

export default function RequestAccessSubmittedPage() {
  return (
    <PageContainer>
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Request received
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Thank you for your interest in HMG Graphics Server. Your request has
          been submitted for review.
        </p>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Submitting a request does not grant immediate access. If your request
          is approved, you will receive an email invitation to create your
          account and set a password.
        </p>
        <p className="mt-6">
          <Link
            href="/"
            className="text-sm font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50"
          >
            Back to home
          </Link>
        </p>
      </div>
    </PageContainer>
  );
}
