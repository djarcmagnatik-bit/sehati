export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-danger-600">
      <span aria-hidden="true">⚠ </span>
      {message}
    </p>
  );
}
