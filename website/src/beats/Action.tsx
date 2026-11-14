/** A beat's one forward action: its key and a verb. */
export function Action({ label, onClick, keyName = 'Enter', disabled = false }: { label: string; onClick: () => void; keyName?: string; disabled?: boolean }) {
  return (
    <button type="button" className="iso-action" onClick={onClick} disabled={disabled}>
      <kbd>{keyName}</kbd>
      <span>{label}</span>
    </button>
  );
}
