/*
 * 화면에서 쓰는 공통 UI. 겉은 Astryx 디자인 시스템 컴포넌트이고, 기존 화면의 호출 방식(props)은 그대로 받는다.
 * 새 화면은 @astryxdesign/core 컴포넌트를 직접 써도 된다.
 */
import { Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Button as AxButton } from "@astryxdesign/core/Button";
import { Badge as AxBadge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Link } from "@astryxdesign/core/Link";
import { HStack } from "@astryxdesign/core/HStack";
import { EmptyState as AxEmptyState } from "@astryxdesign/core/EmptyState";

type ButtonProps = Omit<ComponentPropsWithoutRef<"button">, "color"> & {
  icon?: LucideIcon;
  variant?: string;
};

interface HeadingProps {
  children?: ReactNode;
  title?: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
}

type PanelProps = Omit<ComponentPropsWithoutRef<"section">, "title" | "color"> &
  HeadingProps & { action?: ReactNode };

const textOf = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return "";
};

const buttonVariant = (variant: string) =>
  variant === "danger" ? "destructive" : variant === "ghost" ? "ghost" : variant === "secondary" ? "secondary" : "primary";

export function Button({
  children,
  icon: Icon,
  variant = "primary",
  className = "",
  disabled,
  title,
  type = "button",
  ...props
}: ButtonProps) {
  const text = textOf(children).trim();
  const label = text || props["aria-label"] || title || "";
  const small = className.includes("button--sm");
  return (
    <AxButton
      {...(props as object)}
      type={type as "button" | "submit" | "reset"}
      className={className.replace("button--sm", "").trim() || undefined}
      label={label}
      variant={buttonVariant(variant)}
      size={small ? "sm" : "md"}
      isDisabled={disabled}
      isIconOnly={!text && Boolean(Icon)}
      tooltip={title}
      icon={Icon ? <Icon size={small ? 14 : 16} aria-hidden="true" /> : undefined}
    >{text ? children : undefined}</AxButton>
  );
}

const badgeVariant: Record<string, "neutral" | "info" | "success" | "warning" | "error" | "blue" | "purple" | "orange"> = {
  neutral: "neutral",
  cyan: "info",
  blue: "blue",
  green: "success",
  amber: "warning",
  red: "error",
  violet: "purple",
  orange: "orange",
};

/** 상태·분류 표시. tone은 기존 이름(cyan/green/amber/red/violet/blue)을 받아 Astryx 변형으로 바꾼다. */
export function Badge({ children, tone = "neutral" }: {
  children?: ReactNode;
  tone?: string;
  dot?: boolean;
}) {
  return <AxBadge label={children} variant={badgeVariant[tone] ?? "neutral"} />;
}

/** 한 덩어리(섹션). 제목이 있으면 제목 줄 + 오른쪽 동작. */
export function Panel({
  children,
  title,
  description,
  action,
  className = "",
  id,
  tabIndex,
  role,
  ...props
}: PanelProps) {
  return (
    <Card padding={0} className={`panel ${className}`} id={id} tabIndex={tabIndex} role={role}
      aria-label={props["aria-label"]} aria-labelledby={props["aria-labelledby"]}>
      {title && (
        <HStack className="panel__header" gap={3} vAlign="center" hAlign="between" paddingInline={4} paddingBlock={3}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Heading level={2} weight="semibold">{title}</Heading>
            {description && <Text type="supporting" color="secondary">{description}</Text>}
          </HStack>
          {action}
        </HStack>
      )}
      {children}
    </Card>
  );
}

/** 화면 제목 한 줄 + 주요 버튼 */
export function PageHeader({ title, description, children }: HeadingProps) {
  return (
    <HStack className="page-header" gap={3} vAlign="center" hAlign="between" wrap="wrap">
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Heading level={1} weight="bold">{title}</Heading>
        {description && <Text type="supporting" color="secondary">{description}</Text>}
      </HStack>
      {children && <HStack gap={2} vAlign="center" wrap="wrap">{children}</HStack>}
    </HStack>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  children,
}: HeadingProps & { icon?: LucideIcon }) {
  return <AxEmptyState isCompact title={textOf(title)} description={textOf(description) || undefined}
    icon={<Icon size={20} aria-hidden="true" />} actions={children} />;
}

/** 글자 링크(버튼 동작). 끝에 화살표를 붙이지 않는다. */
export function TextLink({ children, onClick, ...props }: ComponentPropsWithoutRef<"button">) {
  return <Link onClick={onClick} label={props["aria-label"]} type="supporting">{children}</Link>;
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
