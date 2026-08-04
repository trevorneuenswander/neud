"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import {
  clearDesktopCredentials,
  getDesktopCredentials,
  isDesktopEnvironment,
  saveDesktopCredentials,
} from "@/lib/desktop/client";

type ScraperCredentialsSectionProps = {
  engineId: string;
  canControl: boolean;
  active: boolean;
  inactiveMessage?: string;
};

export function ScraperCredentialsSection({
  engineId,
  canControl,
  active,
  inactiveMessage = "Add a Login URL to configure credentials and login selectors.",
}: ScraperCredentialsSectionProps) {
  const [hasCredentials, setHasCredentials] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDesktop = mounted && isDesktopEnvironment();

  const loadSavedCredentials = useCallback(async () => {
    const saved = await getDesktopCredentials(engineId);
    if (!saved) {
      setHasCredentials(false);
      setEmail("");
      setPassword("");
      return;
    }

    setHasCredentials(true);
    setEmail(saved.email);
    setPassword(saved.password);
  }, [engineId]);

  useEffect(() => {
    if (!isDesktop) return;

    let cancelled = false;
    void getDesktopCredentials(engineId).then((saved) => {
      if (cancelled) return;
      if (!saved) {
        setHasCredentials(false);
        setEmail("");
        setPassword("");
        return;
      }

      setHasCredentials(true);
      setEmail(saved.email);
      setPassword(saved.password);
    });

    return () => {
      cancelled = true;
    };
  }, [engineId, isDesktop]);

  if (!isDesktop) {
    return (
      <p className="text-sm text-muted">
        Credential management is available in the desktop app.
      </p>
    );
  }

  async function handleSave() {
    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      setMessage("Auction Password is required.");
      return;
    }

    try {
      await saveDesktopCredentials(engineId, {
        email,
        password: trimmedPassword,
      });
      await loadSavedCredentials();
      setMessage("Credentials saved securely on this PC.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save credentials.",
      );
    }
  }

  async function handleClear() {
    try {
      await clearDesktopCredentials(engineId);
      setHasCredentials(false);
      setEmail("");
      setPassword("");
      setMessage("Credentials removed from this PC.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to clear credentials.",
      );
    }
  }

  return (
    <div className={active ? "space-y-3" : "space-y-3 opacity-60"}>
      {!active ? <p className="text-sm text-muted">{inactiveMessage}</p> : null}
      <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-end">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
          <FormField
            id={`cred-email-${engineId}`}
            name="credentialEmail"
            label="Auction Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="username@example.com"
            disabled={!canControl || !active}
            required={false}
          />
          <FormField
            id={`cred-password-${engineId}`}
            name="credentialPassword"
            label="Auction Password"
            type="text"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            disabled={!canControl || !active}
            required={false}
          />
        </div>
        {canControl && active ? (
          <div className="flex flex-wrap gap-2 xl:shrink-0">
            <Button type="button" size="sm" onClick={() => void handleSave()}>
              Save credentials
            </Button>
            {hasCredentials ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void handleClear()}
              >
                Clear credentials
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}
