import {
  dangerButtonClassName,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "./settings-ui";

type TokenPromptDialogProps = {
  open: boolean;
  modelName: string;
  token: string;
  error: string | null;
  busy: boolean;
  hasStoredToken: boolean;
  onTokenChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onClearStoredToken: () => void;
};

export function TokenPromptDialog(props: TokenPromptDialogProps) {
  const {
    open,
    modelName,
    token,
    error,
    busy,
    hasStoredToken,
    onTokenChange,
    onSubmit,
    onCancel,
    onClearStoredToken,
  } = props;

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-[520px] rounded-[18px] border border-line bg-panel px-5 py-5 shadow-xl">
        <div className="text-base font-semibold text-ink">输入下载 token</div>
        <p className="mt-2 text-sm text-ink/65">
          当前模型：<span className="font-medium text-ink">{modelName}</span>
        </p>
        <p className="mt-1 text-sm text-ink/55">
          token 将按模型保存到 Windows Credential Manager。下次下载同一模型时会自动复用。
        </p>

        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-medium text-ink">Token</span>
          <input
            type="password"
            value={token}
            onChange={(event) => onTokenChange(event.target.value)}
            className={inputClassName}
            placeholder="输入访问 token"
            autoFocus
          />
        </label>

        {error ? <div className="mt-3 rounded-[12px] bg-[#fff1ec] px-3 py-2 text-sm text-[#9c4221]">{error}</div> : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {hasStoredToken ? (
            <button
              type="button"
              onClick={onClearStoredToken}
              className={dangerButtonClassName}
              disabled={busy}
            >
              清除已存 token
            </button>
          ) : null}
          <button type="button" onClick={onCancel} className={secondaryButtonClassName} disabled={busy}>
            取消
          </button>
          <button type="button" onClick={onSubmit} className={primaryButtonClassName} disabled={busy}>
            {busy ? "保存并下载中" : "保存并开始下载"}
          </button>
        </div>
      </div>
    </div>
  );
}
