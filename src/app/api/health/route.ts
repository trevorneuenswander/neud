import { NextResponse } from "next/server";
import { getPasswordResetEmailDiagnostics } from "@/lib/auth/password-reset/email";

export async function GET() {
  const passwordResetEmail = getPasswordResetEmailDiagnostics();

  return NextResponse.json({
    ok: true,
    passwordResetEmail,
  });
}
