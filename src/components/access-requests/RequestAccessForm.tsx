"use client";

import { useActionState, useState } from "react";
import { AuthFormField, TextAreaField } from "@/components/auth/AuthFormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { submitAccessRequest } from "@/lib/access-requests/actions";
import { initialAccessRequestState } from "@/lib/access-requests/state";

export function RequestAccessForm() {
  const [state, formAction] = useActionState(
    submitAccessRequest,
    initialAccessRequestState,
  );
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [comments, setComments] = useState("");

  return (
    <form action={formAction} className="space-y-4">
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <AuthFormField
        id="fullName"
        label="Full name"
        name="fullName"
        autoComplete="name"
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
      />
      <AuthFormField
        id="email"
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <AuthFormField
        id="company"
        label="Company"
        name="company"
        autoComplete="organization"
        value={company}
        onChange={(event) => setCompany(event.target.value)}
      />
      <TextAreaField
        id="comments"
        label="Additional comments"
        name="comments"
        value={comments}
        onChange={(event) => setComments(event.target.value)}
      />

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton pendingLabel="Submitting…">Submit Request</SubmitButton>
    </form>
  );
}
