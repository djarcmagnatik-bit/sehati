"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ChoiceCard } from "@/components/ui/choice-card";
import { FieldError } from "@/components/ui/field-error";
import { TextField } from "@/components/ui/text-field";
import { formatCoupleName, type CoupleDisplayFormatValue } from "@/lib/couple";
import { formatIsoDateLong, isValidIsoDate } from "@/lib/dates";
import type { FieldErrors } from "@/lib/form-state";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { fieldErrorsFromZod } from "@/lib/validation/errors";
import { makeOnboardingStepSchemas, ONBOARDING_FIELD_STEP } from "@/lib/validation/onboarding";
import { createWeddingAction } from "@/server/actions/onboarding-actions";
import type { ReferenceOption } from "@/server/wedding/reference-service";

type Values = {
  displayName: string;
  partnerName: string;
  brideName: string;
  groomName: string;
  coupleDisplayFormat: CoupleDisplayFormatValue;
  customDisplayName: string;
  weddingDate: string;
  engagementDate: string;
  receptionDate: string;
  eventTypeId: string;
  marriageProcessId: string;
  targetBudget: string;
  currency: "IDR";
};

type Props = {
  eventTypes: ReferenceOption[];
  marriageProcesses: ReferenceOption[];
  todayIso: string;
  defaultDisplayName: string;
};

const STEPS = [
  { title: "Tentang kalian berdua", description: "Nama-nama ini tampil di dashboard dan bisa diubah nanti." },
  { title: "Tanggal penting", description: "Tanggal pernikahan menjadi dasar countdown dan jadwal persiapan." },
  { title: "Jenis acara", description: "Pilih yang paling mendekati rencana kalian." },
  { title: "Jalur pernikahan", description: "Membantu menyesuaikan daftar persiapan administrasi." },
  { title: "Target budget", description: "Opsional. Kalian bisa mengisinya nanti." },
  { title: "Periksa & buat workspace", description: "Pastikan data sudah benar sebelum melanjutkan." },
] as const;

const LAST_STEP = STEPS.length - 1;

function formatDateOrDash(value: string): string {
  return value && isValidIsoDate(value) ? formatIsoDateLong(value) : "—";
}

export function OnboardingWizard({ eventTypes, marriageProcesses, todayIso, defaultDisplayName }: Props) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>({
    displayName: defaultDisplayName,
    partnerName: "",
    brideName: "",
    groomName: "",
    coupleDisplayFormat: "BRIDE_GROOM",
    customDisplayName: "",
    weddingDate: "",
    engagementDate: "",
    receptionDate: "",
    eventTypeId: "",
    marriageProcessId: "",
    targetBudget: "",
    currency: "IDR",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasNavigated = useRef(false);
  const schemas = useMemo(() => makeOnboardingStepSchemas(todayIso), [todayIso]);

  useEffect(() => {
    // Move focus to the new step heading for keyboard and screen-reader users (not on first load).
    if (hasNavigated.current) headingRef.current?.focus();
  }, [step]);

  function update<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function goTo(nextStep: number) {
    hasNavigated.current = true;
    setStep(nextStep);
  }

  function validateCurrentStep(): boolean {
    const schema = [schemas.couple, schemas.dates, schemas.eventType, schemas.marriageProcess, schemas.budget][step];
    if (!schema) return true;
    const result = schema.safeParse(values);
    if (result.success) {
      setErrors({});
      return true;
    }
    setErrors(fieldErrorsFromZod(result.error));
    return false;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (step < LAST_STEP) {
      if (validateCurrentStep()) goTo(step + 1);
      else setFormError("Periksa kembali isian yang ditandai.");
      return;
    }

    startTransition(async () => {
      // On success the action redirects to the dashboard.
      const result = await createWeddingAction(values);
      if (result && !result.ok) {
        setFormError(result.message);
        if (result.fieldErrors) {
          setErrors(result.fieldErrors);
          const invalidSteps = Object.keys(result.fieldErrors)
            .map((field) => ONBOARDING_FIELD_STEP[field])
            .filter((index): index is number => index !== undefined);
          if (invalidSteps.length > 0) goTo(Math.min(...invalidSteps));
        }
      }
    });
  }

  const current = STEPS[step] ?? STEPS[0];
  const coupleNamePreview = formatCoupleName({
    brideName: values.brideName.trim() || "Mempelai wanita",
    groomName: values.groomName.trim() || "Mempelai pria",
    format: values.coupleDisplayFormat,
    customDisplayName: values.customDisplayName,
  });
  const budgetAmount = values.targetBudget.trim() ? parseRupiah(values.targetBudget) : null;
  const bride = values.brideName.trim() || "Mempelai wanita";
  const groom = values.groomName.trim() || "Mempelai pria";

  const formatOptions: Array<{ value: CoupleDisplayFormatValue; label: string }> = [
    { value: "BRIDE_GROOM", label: `${bride} & ${groom}` },
    { value: "GROOM_BRIDE", label: `${groom} & ${bride}` },
    { value: "CUSTOM", label: "Tulis sendiri" },
  ];

  const reviewRows: Array<{ label: string; value: string; step: number }> = [
    { label: "Nama pasangan", value: coupleNamePreview, step: 0 },
    { label: "Nama kamu", value: values.displayName || "—", step: 0 },
    { label: "Nama pasanganmu", value: values.partnerName || "—", step: 0 },
    { label: "Tanggal pernikahan", value: formatDateOrDash(values.weddingDate), step: 1 },
    { label: "Tanggal lamaran", value: formatDateOrDash(values.engagementDate), step: 1 },
    { label: "Tanggal resepsi", value: formatDateOrDash(values.receptionDate), step: 1 },
    { label: "Jenis acara", value: eventTypes.find((o) => o.id === values.eventTypeId)?.name ?? "—", step: 2 },
    {
      label: "Jalur pernikahan",
      value: marriageProcesses.find((o) => o.id === values.marriageProcessId)?.name ?? "—",
      step: 3,
    },
    { label: "Target budget", value: budgetAmount !== null ? formatRupiah(budgetAmount) : "Belum diatur", step: 4 },
  ];

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div>
        <p className="text-sm font-medium text-clay-700">
          Langkah {step + 1} dari {STEPS.length}
        </p>
        <div
          role="progressbar"
          aria-label="Progres pengisian"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream-200"
        >
          <div
            className="h-full rounded-full bg-clay-600 transition-[width] duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <h1 ref={headingRef} tabIndex={-1} className="mt-5 font-display text-3xl font-semibold focus:outline-none">
          {current.title}
        </h1>
        <p className="mt-1 text-ink-700">{current.description}</p>
      </div>

      {formError ? <Alert tone="error">{formError}</Alert> : null}

      <div className="rounded-3xl border border-cream-200 bg-white p-5 sm:p-6">
        {step === 0 ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Nama panggilan kamu"
                name="displayName"
                required
                maxLength={80}
                autoComplete="nickname"
                value={values.displayName}
                onChange={(e) => update("displayName", e.target.value)}
                errors={errors.displayName}
              />
              <TextField
                label="Nama pasangan"
                name="partnerName"
                required
                maxLength={80}
                value={values.partnerName}
                onChange={(e) => update("partnerName", e.target.value)}
                errors={errors.partnerName}
              />
              <TextField
                label="Nama mempelai wanita"
                name="brideName"
                required
                maxLength={80}
                value={values.brideName}
                onChange={(e) => update("brideName", e.target.value)}
                errors={errors.brideName}
              />
              <TextField
                label="Nama mempelai pria"
                name="groomName"
                required
                maxLength={80}
                value={values.groomName}
                onChange={(e) => update("groomName", e.target.value)}
                errors={errors.groomName}
              />
            </div>

            <fieldset aria-describedby={errors.coupleDisplayFormat ? "coupleDisplayFormat-error" : undefined}>
              <legend className="text-sm font-medium text-ink-900">Format nama pasangan</legend>
              <div className="mt-2 grid gap-2">
                {formatOptions.map((option) => (
                  <ChoiceCard
                    key={option.value}
                    name="coupleDisplayFormat"
                    value={option.value}
                    label={option.label}
                    checked={values.coupleDisplayFormat === option.value}
                    onSelect={(value) => update("coupleDisplayFormat", value as CoupleDisplayFormatValue)}
                  />
                ))}
              </div>
              <FieldError id="coupleDisplayFormat-error" message={errors.coupleDisplayFormat?.[0]} />
            </fieldset>

            {values.coupleDisplayFormat === "CUSTOM" ? (
              <TextField
                label="Nama tampilan pasangan"
                name="customDisplayName"
                required
                maxLength={120}
                placeholder="Contoh: The Wedding of Putri & Fajar"
                value={values.customDisplayName}
                onChange={(e) => update("customDisplayName", e.target.value)}
                errors={errors.customDisplayName}
              />
            ) : null}

            <p className="text-sm text-ink-500">
              Tampil sebagai: <strong className="text-ink-900">{coupleNamePreview}</strong>
            </p>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <TextField
              label="Tanggal pernikahan"
              name="weddingDate"
              type="date"
              required
              min={todayIso}
              value={values.weddingDate}
              onChange={(e) => update("weddingDate", e.target.value)}
              errors={errors.weddingDate}
            />
            <TextField
              label="Tanggal lamaran (opsional)"
              name="engagementDate"
              type="date"
              max={values.weddingDate || undefined}
              value={values.engagementDate}
              onChange={(e) => update("engagementDate", e.target.value)}
              errors={errors.engagementDate}
            />
            <TextField
              label="Tanggal resepsi (opsional)"
              name="receptionDate"
              type="date"
              min={values.weddingDate || todayIso}
              hint="Kosongkan jika resepsi di hari yang sama atau tidak ada."
              value={values.receptionDate}
              onChange={(e) => update("receptionDate", e.target.value)}
              errors={errors.receptionDate}
            />
          </div>
        ) : null}

        {step === 2 ? (
          <fieldset aria-describedby={errors.eventTypeId ? "eventTypeId-error" : undefined}>
            <legend className="sr-only">Jenis acara</legend>
            <div className="grid gap-2">
              {eventTypes.map((option) => (
                <ChoiceCard
                  key={option.id}
                  name="eventTypeId"
                  value={option.id}
                  label={option.name}
                  description={option.description}
                  checked={values.eventTypeId === option.id}
                  onSelect={(value) => update("eventTypeId", value)}
                />
              ))}
            </div>
            <FieldError id="eventTypeId-error" message={errors.eventTypeId?.[0]} />
          </fieldset>
        ) : null}

        {step === 3 ? (
          <fieldset aria-describedby={errors.marriageProcessId ? "marriageProcessId-error" : undefined}>
            <legend className="sr-only">Jalur pernikahan</legend>
            <div className="grid gap-2">
              {marriageProcesses.map((option) => (
                <ChoiceCard
                  key={option.id}
                  name="marriageProcessId"
                  value={option.id}
                  label={option.name}
                  description={option.description}
                  checked={values.marriageProcessId === option.id}
                  onSelect={(value) => update("marriageProcessId", value)}
                />
              ))}
            </div>
            <FieldError id="marriageProcessId-error" message={errors.marriageProcessId?.[0]} />
          </fieldset>
        ) : null}

        {step === 4 ? (
          <TextField
            label="Target total budget (Rupiah)"
            name="targetBudget"
            inputMode="numeric"
            autoComplete="off"
            placeholder="100.000.000"
            hint={budgetAmount !== null ? `Terbaca: ${formatRupiah(budgetAmount)}` : "Mata uang: Rupiah (IDR)."}
            value={values.targetBudget}
            onChange={(e) => update("targetBudget", e.target.value)}
            errors={errors.targetBudget}
          />
        ) : null}

        {step === LAST_STEP ? (
          <dl className="divide-y divide-cream-200">
            {reviewRows.map((row) => (
              <div key={row.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                <dt className="text-sm text-ink-500">{row.label}</dt>
                <dd className="flex items-center gap-3 text-sm font-medium text-ink-900">
                  <span>{row.value}</span>
                  <button
                    type="button"
                    onClick={() => goTo(row.step)}
                    className="rounded-full px-2 py-1 text-xs font-semibold text-clay-700 underline-offset-4 hover:underline"
                  >
                    Ubah<span className="sr-only"> {row.label.toLowerCase()}</span>
                  </button>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button
            variant="ghost"
            disabled={isPending}
            onClick={() => {
              setFormError(null);
              setErrors({});
              goTo(step - 1);
            }}
          >
            Kembali
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={isPending}>
          {step < LAST_STEP ? "Lanjut" : isPending ? "Membuat workspace…" : "Buat workspace"}
        </Button>
      </div>
    </form>
  );
}
