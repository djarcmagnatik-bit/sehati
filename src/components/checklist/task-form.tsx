"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskPriorityValue,
  type TaskStatusValue,
} from "@/lib/checklist";
import { initialFormState } from "@/lib/form-state";
import { createTaskAction, updateTaskAction } from "@/server/actions/task-actions";

type TaskFormDefaults = {
  title: string;
  description: string | null;
  categoryId: string;
  dueDate: string | null;
  priority: TaskPriorityValue;
  status: TaskStatusValue;
  assigneeMemberId: string | null;
};

type TaskFormProps = {
  categories: Array<{ id: string; name: string }>;
  members: Array<{ id: string; displayName: string }>;
} & ({ mode: "create"; weddingId: string } | { mode: "edit"; taskId: string; defaults: TaskFormDefaults });

export function TaskForm(props: TaskFormProps) {
  const [state, formAction] = useActionState(
    props.mode === "create" ? createTaskAction : updateTaskAction,
    initialFormState,
  );

  const defaults: TaskFormDefaults =
    props.mode === "edit"
      ? props.defaults
      : {
          title: "",
          description: null,
          categoryId: "",
          dueDate: null,
          priority: "MEDIUM",
          status: "TODO",
          assigneeMemberId: null,
        };
  const value = (key: keyof TaskFormDefaults): string => state.values?.[key] ?? defaults[key] ?? "";

  return (
    // Re-key after a failed submit so selects pick up the echoed values.
    <form key={state.values ? JSON.stringify(state.values) : "initial"} action={formAction} noValidate className="space-y-5">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      {props.mode === "create" ? (
        <input type="hidden" name="weddingId" value={props.weddingId} />
      ) : (
        <input type="hidden" name="taskId" value={props.taskId} />
      )}

      <TextField
        label="Judul tugas"
        name="title"
        required
        maxLength={160}
        defaultValue={value("title")}
        errors={state.fieldErrors?.title}
      />
      <TextareaField
        label="Deskripsi (opsional)"
        name="description"
        rows={3}
        maxLength={2000}
        defaultValue={value("description")}
        errors={state.fieldErrors?.description}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label="Kategori"
          name="categoryId"
          required
          defaultValue={value("categoryId")}
          options={[{ value: "", label: "Pilih kategori" }, ...props.categories.map((c) => ({ value: c.id, label: c.name }))]}
          errors={state.fieldErrors?.categoryId}
        />
        <TextField
          label="Tenggat (opsional)"
          name="dueDate"
          type="date"
          defaultValue={value("dueDate")}
          errors={state.fieldErrors?.dueDate}
        />
        <SelectField
          label="Prioritas"
          name="priority"
          required
          defaultValue={value("priority")}
          options={TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_LABEL[p] }))}
          errors={state.fieldErrors?.priority}
        />
        <SelectField
          label="Penanggung jawab"
          name="assigneeMemberId"
          defaultValue={value("assigneeMemberId")}
          options={[
            { value: "", label: "Belum ditentukan" },
            ...props.members.map((m) => ({ value: m.id, label: m.displayName })),
          ]}
          errors={state.fieldErrors?.assigneeMemberId}
        />
        {props.mode === "edit" ? (
          <SelectField
            label="Status"
            name="status"
            required
            defaultValue={value("status")}
            options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }))}
            errors={state.fieldErrors?.status}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/checklist" className={buttonClassName("ghost")}>
          Batal
        </Link>
        <SubmitButton pendingLabel="Menyimpan…">{props.mode === "create" ? "Simpan tugas" : "Simpan perubahan"}</SubmitButton>
      </div>
    </form>
  );
}
