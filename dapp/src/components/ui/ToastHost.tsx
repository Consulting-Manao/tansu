import { useStore } from "@nanostores/react";
import cx from "classnames";
import { IconButton } from "./IconButton";
import { CheckCircleIcon, CloseIcon, ErrorIcon, InfoIcon } from "./icons";
import { dismissToast, toasts, type ToastTone } from "./toast";

const icons: Record<ToastTone, { Icon: () => React.ReactNode; tint: string }> =
  {
    success: { Icon: CheckCircleIcon, tint: "text-vote-approve" },
    danger: { Icon: ErrorIcon, tint: "text-vote-reject" },
    info: { Icon: InfoIcon, tint: "text-accent" },
  };

/**
 * Where toasts show: the bottom right with a pointer, the bottom of the
 * screen on phones. Successes are announced politely, errors at once.
 */
export function ToastHost() {
  const list = useStore(toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-96"
    >
      {list.map((toast) => {
        const { Icon, tint } = icons[toast.tone];
        return (
          <div
            key={toast.id}
            role={toast.tone === "danger" ? "alert" : "status"}
            className="pointer-events-auto flex items-start gap-3 rounded-control bg-ink p-4 text-ui text-ground shadow-float"
          >
            <span className={cx("mt-px", tint)}>
              <Icon />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{toast.title}</p>
              {toast.description && <p className="mt-1">{toast.description}</p>}
              {toast.link && (
                <a
                  href={toast.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block font-semibold underline"
                >
                  {toast.link.label}
                </a>
              )}
            </div>
            <IconButton
              label="Dismiss"
              onClick={() => dismissToast(toast.id)}
              className="-my-2 -mr-2 text-ground hover:bg-transparent"
            >
              <CloseIcon />
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}
