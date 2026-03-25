export function Toast({
  message,
  onClose,
}: {
  message: string | null;
  onClose: () => void;
}) {
  if (!message) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-ink shadow-panel">
      <div className="flex items-start gap-4">
        <p className="flex-1">{message}</p>
        <button type="button" onClick={onClose} className="text-ink/55">
          关闭
        </button>
      </div>
    </div>
  );
}
