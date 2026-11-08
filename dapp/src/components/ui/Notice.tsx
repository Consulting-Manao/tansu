import cx from "classnames";
import type { ReactNode } from "react";
import { CheckCircleIcon, ErrorIcon, InfoIcon, WarningIcon } from "./icons";

export type NoticeTone = "info" | "success" | "warning" | "danger";

const looks: Record<
  NoticeTone,
  { box: string; icon: string; Icon: () => ReactNode }
> = {
  info: { box: "bg-info-soft", icon: "text-info", Icon: InfoIcon },
  success: {
    box: "bg-success-soft",
    icon: "text-success",
    Icon: CheckCircleIcon,
  },
  warning: { box: "bg-warning-soft", icon: "text-warning", Icon: WarningIcon },
  danger: { box: "bg-danger-soft", icon: "text-danger", Icon: ErrorIcon },
};

interface NoticeProps {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Announce it when it appears: an error after an action, not page text. */
  live?: boolean;
  className?: string;
}

/** A note inside a page or a dialog. A success after an action is a toast. */
export function Notice({
  tone = "info",
  title,
  children,
  live,
  className,
}: NoticeProps) {
  const { box, icon, Icon } = looks[tone];
  return (
    <div
      role={live ? (tone === "danger" ? "alert" : "status") : undefined}
      className={cx(
        "flex gap-3 rounded-control px-4 py-3 text-ui text-ink",
        box,
        className,
      )}
    >
      <span className={cx("mt-px", icon)}>
        <Icon />
      </span>
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}
