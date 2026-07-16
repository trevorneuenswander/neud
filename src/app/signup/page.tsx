import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";

export default function SignupPage() {
  return (
    <PageContainer>
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Sign up
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Account registration is not yet available. This page will allow new
          users to create portal accounts in a future phase.
        </p>
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50"
          >
            Log in
          </Link>
        </p>
      </div>
    </PageContainer>
  );
}
