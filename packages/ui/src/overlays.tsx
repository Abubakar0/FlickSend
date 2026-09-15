import * as AccordionPrimitive from "@radix-ui/react-accordion";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactElement, ReactNode } from "react";
import { Button } from "./actions.js";
import { Icon } from "./icons.js";
import { classNames } from "./utils.js";

export function Tooltip({ children, content }: { children: ReactElement; content: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content className="fs-tooltip" sideOffset={8}>
            {content}
            <TooltipPrimitive.Arrow className="fs-tooltip__arrow" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export function Popover({
  children,
  content,
  trigger
}: {
  children?: ReactNode;
  content?: ReactNode;
  trigger: ReactElement;
}) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content className="fs-popover" sideOffset={10}>
          {content ?? children}
          <PopoverPrimitive.Arrow className="fs-popover__arrow" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export type MenuItem = { disabled?: boolean; label: string; onSelect?: () => void };

export function DropdownMenu({
  items,
  label,
  trigger
}: {
  items: MenuItem[];
  label: string;
  trigger: ReactElement;
}) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger aria-label={label} asChild>
        {trigger}
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content align="end" className="fs-menu" sideOffset={8}>
          {items.map((item) => (
            <DropdownMenuPrimitive.Item
              className="fs-menu__item"
              disabled={item.disabled}
              key={item.label}
              onSelect={item.onSelect}
            >
              {item.label}
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

type DialogBaseProps = {
  children: ReactNode;
  description?: string;
  footer?: ReactNode;
  title: string;
  trigger: ReactElement;
};

type DialogProps = DialogBaseProps & {
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
};

export function Dialog({
  children,
  description,
  footer,
  onOpenChange,
  open,
  title,
  trigger
}: DialogProps) {
  return (
    <DialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fs-overlay" />
        <DialogPrimitive.Content className="fs-dialog">
          <div className="fs-dialog__heading">
            <div>
              <DialogPrimitive.Title className="fs-heading fs-heading--card">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="fs-dialog__description">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close aria-label="Close dialog" className="fs-dialog__close">
              <Icon name="close" />
            </DialogPrimitive.Close>
          </div>
          <div className="fs-dialog__body">{children}</div>
          {footer ? <div className="fs-dialog__footer">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Sheet({
  children,
  description,
  footer,
  side = "right",
  title,
  trigger
}: DialogBaseProps & { side?: "left" | "right" }) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fs-overlay" />
        <DialogPrimitive.Content className={classNames("fs-sheet", `fs-sheet--${side}`)}>
          <DialogPrimitive.Title className="fs-heading fs-heading--card">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="fs-dialog__description">
              {description}
            </DialogPrimitive.Description>
          ) : null}
          <div className="fs-dialog__body">{children}</div>
          {footer ? <div className="fs-dialog__footer">{footer}</div> : null}
          <DialogPrimitive.Close aria-label="Close panel" className="fs-dialog__close">
            <Icon name="close" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ConfirmDialog({
  actionLabel,
  children,
  description,
  onConfirm,
  title,
  trigger
}: DialogBaseProps & { actionLabel: string; onConfirm: () => void }) {
  return (
    <AlertDialogPrimitive.Root>
      <AlertDialogPrimitive.Trigger asChild>{trigger}</AlertDialogPrimitive.Trigger>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fs-overlay" />
        <AlertDialogPrimitive.Content className="fs-dialog">
          <AlertDialogPrimitive.Title className="fs-heading fs-heading--card">
            {title}
          </AlertDialogPrimitive.Title>
          {description ? (
            <AlertDialogPrimitive.Description className="fs-dialog__description">
              {description}
            </AlertDialogPrimitive.Description>
          ) : null}
          <div className="fs-dialog__body">{children}</div>
          <div className="fs-dialog__footer">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="secondary">Keep transfer</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button onClick={onConfirm} variant="danger">
                {actionLabel}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

export type TabItem = { content: ReactNode; label: string; value: string };

export function Tabs({ defaultValue, items }: { defaultValue: string; items: TabItem[] }) {
  return (
    <TabsPrimitive.Root className="fs-tabs" defaultValue={defaultValue}>
      <TabsPrimitive.List aria-label="Showcase sections" className="fs-tabs__list">
        {items.map((item) => (
          <TabsPrimitive.Trigger className="fs-tabs__trigger" key={item.value} value={item.value}>
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content className="fs-tabs__content" key={item.value} value={item.value}>
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}

export type AccordionItem = { content: ReactNode; title: string; value: string };

export function Accordion({ items }: { items: AccordionItem[] }) {
  return (
    <AccordionPrimitive.Root className="fs-accordion" collapsible type="single">
      {items.map((item) => (
        <AccordionPrimitive.Item className="fs-accordion__item" key={item.value} value={item.value}>
          <AccordionPrimitive.Header>
            <AccordionPrimitive.Trigger className="fs-accordion__trigger">
              {item.title}
              <Icon name="chevron-down" />
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>
          <AccordionPrimitive.Content className="fs-accordion__content">
            {item.content}
          </AccordionPrimitive.Content>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  );
}
