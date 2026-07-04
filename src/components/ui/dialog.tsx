import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useComposedRefs } from "@radix-ui/react-compose-refs";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogPortalContainerContext = React.createContext<HTMLElement | null>(null);

export function useDialogPortalContainer() {
  return React.useContext(DialogPortalContainerContext);
}

function isNestedPortalTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return (
    target.closest('[role="listbox"]') !== null ||
    target.closest("[data-radix-select-viewport]") !== null
  );
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(
  (
    {
      className,
      children,
      onPointerDownOutside,
      onFocusOutside,
      onInteractOutside,
      ...props
    },
    ref,
  ) => {
    const [portalContainer, setPortalContainer] = React.useState<HTMLElement | null>(null);
    const composedRef = useComposedRefs(ref, setPortalContainer);

    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPortalContainerContext.Provider value={portalContainer}>
          <DialogPrimitive.Content
            ref={composedRef}
            className={cn(
              "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border bg-background p-6 shadow-lg",
              className,
            )}
            onPointerDownOutside={(event) => {
              if (isNestedPortalTarget(event.target)) {
                event.preventDefault();
                return;
              }
              onPointerDownOutside?.(event);
            }}
            onFocusOutside={(event) => {
              const relatedTarget = event.detail.originalEvent.relatedTarget;
              if (
                isNestedPortalTarget(event.target) ||
                isNestedPortalTarget(relatedTarget)
              ) {
                event.preventDefault();
                return;
              }
              onFocusOutside?.(event);
            }}
            onInteractOutside={(event) => {
              if (isNestedPortalTarget(event.target)) {
                event.preventDefault();
                return;
              }
              onInteractOutside?.(event);
            }}
            {...props}
          >
            {children}
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
              <X className="h-4 w-4" />
              <span className="sr-only">关闭</span>
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPortalContainerContext.Provider>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-left", className)} {...props} />
);

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
};
