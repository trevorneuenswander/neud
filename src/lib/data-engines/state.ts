export type DataEngineActionState = {
  error: string | null;
  success: string | null;
  fieldValues?: Record<string, string>;
};

export const initialDataEngineActionState: DataEngineActionState = {
  error: null,
  success: null,
};
