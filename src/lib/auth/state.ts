export type AuthActionState = {
  error: string | null;
  success: string | null;
};

export const initialAuthState: AuthActionState = {
  error: null,
  success: null,
};
