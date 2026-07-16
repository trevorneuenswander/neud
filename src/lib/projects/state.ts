export type ProjectActionState = {
  error: string | null;
  success: string | null;
  fieldValues?: Record<string, string>;
};

export const initialProjectActionState: ProjectActionState = {
  error: null,
  success: null,
};
