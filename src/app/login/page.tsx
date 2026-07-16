import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";

export default function LoginPage() {
  return (
    <PageContainer>
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Log in
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Authentication is not yet available. This page will provide secure
          portal access when sign-in is implemented.
        </p>
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50"
          >
            Sign up
          </Link>
        </p>
      </div>
    </PageContainer>
  );
}
