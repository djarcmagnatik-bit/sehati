export type FieldErrors = Partial<Record<string, string[]>>;

export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Non-secret values echoed back so fields keep their content after a failed submit. */
  values?: Record<string, string>;
};

export const initialFormState: FormState = { status: "idle" };
