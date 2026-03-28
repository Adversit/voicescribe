import type { ReactNode } from "react";
import clsx from "clsx";

export const inputClassName = "settings-input";
export const selectClassName = "settings-input";
export const primaryButtonClassName = "app-btn app-btn-primary";
export const secondaryButtonClassName = "app-btn app-btn-secondary";
export const dangerButtonClassName = "app-btn app-btn-danger";

export function SettingsPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <h1 className="settings-page-title">{title}</h1>
        {description ? <p className="settings-page-description">{description}</p> : null}
      </header>
      <div className="settings-page-body">{children}</div>
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("settings-section", className)}>
      <div className="settings-section-header">
        <div>
          <div className="settings-section-title">{title}</div>
          {description ? <p className="settings-section-description">{description}</p> : null}
        </div>
        {actions ? <div className="settings-section-actions">{actions}</div> : null}
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

export function SettingsRow({
  title,
  description,
  control,
  className,
}: {
  title: string;
  description?: string;
  control?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("settings-row", className)}>
      <div className="min-w-0">
        <div className="settings-row-title">{title}</div>
        {description ? <p className="settings-row-description">{description}</p> : null}
      </div>
      {control ? <div className="shrink-0">{control}</div> : null}
    </div>
  );
}

export function SettingsField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="settings-field">
      <span className="settings-field-label">{label}</span>
      {children}
      {hint ? <span className="settings-field-hint">{hint}</span> : null}
    </label>
  );
}

export function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx("toggle-switch", checked && "is-on")}
    >
      <span className="toggle-switch-knob" />
    </button>
  );
}