export type AccessRequestActionState = {
  error: string | null;
};

export const initialAccessRequestState: AccessRequestActionState = {
  error: null,
};

export type AdminActionState = {
  error: string | null;
  success: string | null;
};

export const initialAdminActionState: AdminActionState = {
  error: null,
  success: null,
};
