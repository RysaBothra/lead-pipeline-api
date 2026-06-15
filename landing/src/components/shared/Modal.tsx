import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../utils/cn";
import { buttonAnalytics } from "../../services/analytics/analytics";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  hideCloseButton?: boolean;
  hideHeader?: boolean;
  title: string | React.ReactNode;
  children: React.ReactNode;
  fullscreen?: boolean;
  className?: string;
  headerActions?: React.ReactNode;
  placement?: "center" | "anchored";
  anchorRef?: React.RefObject<HTMLElement | null>;
  anchorOffsetX?: number;
  anchorOffsetY?: number;
  anchoredWidthEstimate?: number;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  hideCloseButton,
  hideHeader,
  fullscreen,
  className,
  headerActions,
  anchorRef,
  anchorOffsetX = 0,
  anchorOffsetY = 8,
  anchoredWidthEstimate = 420,
  placement = "center",
}: ModalProps) {
  if (!isOpen) return null;

  const isAnchored = placement === "anchored";
  let anchoredTop = 80;
  let anchoredLeft = 16;

  if (isAnchored && anchorRef?.current && typeof window !== "undefined") {
    const rect = anchorRef.current.getBoundingClientRect();
    const maxLeft = Math.max(16, window.innerWidth - anchoredWidthEstimate - 16);
    const preferredLeft = rect.right - anchoredWidthEstimate + anchorOffsetX;
    anchoredTop = Math.max(16, rect.bottom + anchorOffsetY);
    anchoredLeft = Math.max(16, Math.min(preferredLeft, maxLeft));
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div
        className={cn(
          "flex text-center",
          fullscreen
            ? "h-full items-stretch p-4"
            : isAnchored
              ? "min-h-screen p-0"
              : "min-h-screen items-center justify-center p-4 sm:p-0",
        )}
      >
        {/* Semi-transparent backdrop */}
        <div
          className={cn(
            "fixed inset-0 transition-opacity",
            isAnchored ? "bg-transparent" : "bg-black/60 backdrop-blur-sm",
          )}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 40,
          }}
          onClick={hideCloseButton ? undefined : onClose}
        />

        <div
          className={cn(
            "relative transform overflow-hidden",
            "bg-white dark:bg-dark-secondary text-left shadow-2xl transition-all border border-light-border dark:border-dark-border",
            fullscreen
              ? "w-full h-full rounded-xl flex flex-col border border-light-border dark:border-dark-border"
              : isAnchored
                ? "w-[calc(100vw-2rem)] sm:w-fit max-w-[calc(100vw-2rem)] min-h-[10rem] rounded-none sm:rounded-sm"
                : "w-full sm:w-fit max-w-[calc(100vw-2rem)] sm:min-w-[40rem] min-h-[10rem] rounded-lg mx-4 sm:mx-0",
            "z-50",
            className,
          )}
          style={
            isAnchored
              ? { zIndex: 50, position: "fixed", top: anchoredTop, left: anchoredLeft }
              : { zIndex: 50, position: "relative" }
          }
        >
          {/* Header */}
          {!hideHeader && (
            <div className="px-4 py-3 sm:px-6 border-b border-light-border dark:border-dark-border flex items-center justify-between">
              {typeof title === "string" ? (
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {title}
                </h3>
              ) : (
                <div className="flex-1">{title}</div>
              )}
              <div className="flex items-center gap-2">
                {headerActions}
                {!hideCloseButton && (
                  <button
                    aria-label="Close"
                    onClick={() => {
                      buttonAnalytics.trackButtonClick("Button Clicked", {
                        button_name: "Close Modal",
                        page_name: "Modal",
                        feature_area: "UI",
                        modal_title:
                          typeof title === "string" ? title : "Custom Title",
                      });
                      onClose();
                    }}
                    className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:text-gray-300 hover:bg-light-tertiary dark:hover:bg-dark-tertiary dark:hover:text-gray-100 focus:outline-none"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Content */}
          <div
            className={cn(
              "text-gray-800 dark:text-gray-200",
              fullscreen
                ? "flex-1 flex flex-col overflow-hidden"
                : "px-4 pb-4 pt-5 sm:p-6 sm:pb-4 max-h-[calc(100vh-10rem)] overflow-auto custom-scrollbar",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  // Use Portal for better Firefox compatibility
  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : modalContent;
}
