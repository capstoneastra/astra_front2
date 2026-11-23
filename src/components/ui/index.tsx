import { ArrowUpRight, Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  icon?: LucideIcon;
  variant?: string;
};

interface HeadingProps {
  children?: ReactNode;
  title?: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
}

type PanelProps = Omit<ComponentPropsWithoutRef<"section">, "title"> &
  HeadingProps & { action?: ReactNode };

export function Button({
  children,
  icon: Icon,
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`button button--${variant} ${className}`}
      {...props}
    >
      {Icon && <Icon size={17} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Badge({ children, tone = "neutral", dot = false }: {
  children?: ReactNode;
  tone?: string;
  dot?: boolean;
}) {
  return (
    <span className={`badge badge--${tone}`}>
      {dot && <i aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Panel({
  children,
  title,
  eyebrow,
  description,
  action,
  className = "",
  ...props
}: PanelProps) {
  return (
    <section className={`panel ${className}`} {...props}>
      {title && (
        <header className="panel__header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {action && <div className="panel__action">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

// 제목 한 줄 + 주요 버튼. eyebrow(영문 라벨)는 더 이상 그리지 않는다(기존 호출 호환용으로만 받음).
export function PageHeader({
  title,
  description,
  children,
}: HeadingProps) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && (
        <div className="page-header__actions tw:flex tw:items-center tw:gap-[9px]">
          {children}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  children,
}: HeadingProps & { icon?: LucideIcon }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">
        <Icon size={23} aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}

export function TextLink({ children, onClick, ...props }: ComponentPropsWithoutRef<"button">) {
  return (
    <button type="button" className="text-link" onClick={onClick} {...props}>
      {children}
      <ArrowUpRight size={15} aria-hidden="true" />
    </button>
  );
}

export function FormField({ label, id, hint, children, className = "" }: {
  label: ReactNode;
  id: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`form-field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}
