import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cloneElement, type ReactElement } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";
import { Icon } from "./icons.js";
import { classNames } from "./utils.js";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={classNames("fs-label", className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={classNames("fs-input", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={classNames("fs-textarea", className)} {...props} />;
}

export function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={classNames("fs-native-select", className)} {...props} />;
}

export function Field({
  children,
  description,
  error,
  id,
  label,
  optional = false,
  required = false
}: {
  children: ReactElement<{ "aria-describedby"?: string; "aria-invalid"?: boolean }>;
  description?: string;
  error?: string;
  id: string;
  label: string;
  optional?: boolean;
  required?: boolean;
}) {
  const messageId = error ? `${id}-error` : description ? `${id}-description` : undefined;
  const describedBy = [children.props["aria-describedby"], messageId].filter(Boolean).join(" ");
  const control = cloneElement(children, {
    "aria-describedby": describedBy || undefined,
    "aria-invalid": Boolean(error) || children.props["aria-invalid"]
  });
  return (
    <div className="fs-field">
      <div className="fs-field__label-row">
        <Label htmlFor={id}>
          {label}
          {required ? <span aria-label="required"> *</span> : null}
        </Label>
        {optional ? <span className="fs-field__optional">Optional</span> : null}
      </div>
      {control}
      {description && !error ? (
        <p id={messageId} className="fs-field__description">
          {description}
        </p>
      ) : null}
      {error ? <FormMessage id={messageId}>{error}</FormMessage> : null}
    </div>
  );
}

export function FormMessage({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p className="fs-form-message" id={id} role="alert">
      <Icon name="warning" />
      {children}
    </p>
  );
}

export function Checkbox({
  checked,
  defaultChecked,
  disabled,
  id,
  label,
  onCheckedChange
}: {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  id: string;
  label: ReactNode;
  onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <div className="fs-choice">
      <CheckboxPrimitive.Root
        checked={checked}
        className="fs-checkbox"
        defaultChecked={defaultChecked}
        disabled={disabled}
        id={id}
        onCheckedChange={(next) => onCheckedChange?.(next === true)}
      >
        <CheckboxPrimitive.Indicator className="fs-checkbox__indicator">
          <Icon name="check" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

export type RadioOption = { description?: string; label: string; value: string };

export function RadioGroup({
  defaultValue,
  label,
  name,
  onValueChange,
  options,
  value
}: {
  defaultValue?: string;
  label: string;
  name: string;
  onValueChange?: (value: string) => void;
  options: RadioOption[];
  value?: string;
}) {
  return (
    <fieldset className="fs-radio-group">
      <legend className="fs-label">{label}</legend>
      <RadioGroupPrimitive.Root
        aria-label={label}
        defaultValue={defaultValue}
        name={name}
        onValueChange={onValueChange}
        value={value}
      >
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          return (
            <div className="fs-choice" key={option.value}>
              <RadioGroupPrimitive.Item className="fs-radio" id={id} value={option.value}>
                <RadioGroupPrimitive.Indicator className="fs-radio__indicator" />
              </RadioGroupPrimitive.Item>
              <Label htmlFor={id}>
                {option.label}
                {option.description ? (
                  <span className="fs-choice__description">{option.description}</span>
                ) : null}
              </Label>
            </div>
          );
        })}
      </RadioGroupPrimitive.Root>
    </fieldset>
  );
}

export function Switch({
  checked,
  defaultChecked,
  description,
  disabled,
  id,
  label,
  onCheckedChange
}: {
  checked?: boolean;
  defaultChecked?: boolean;
  description?: string;
  disabled?: boolean;
  id: string;
  label: string;
  onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <div className="fs-switch-row">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {description ? <p className="fs-choice__description">{description}</p> : null}
      </div>
      <SwitchPrimitive.Root
        checked={checked}
        className="fs-switch"
        defaultChecked={defaultChecked}
        disabled={disabled}
        id={id}
        onCheckedChange={onCheckedChange}
      >
        <SwitchPrimitive.Thumb className="fs-switch__thumb" />
      </SwitchPrimitive.Root>
    </div>
  );
}

export type SelectOption = { disabled?: boolean; label: string; value: string };

export function Select({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ariaLabel,
  defaultValue,
  disabled,
  id,
  onValueChange,
  options,
  placeholder = "Choose an option",
  value
}: {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  ariaLabel: string;
  defaultValue?: string;
  disabled?: boolean;
  id?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  value?: string;
}) {
  return (
    <SelectPrimitive.Root
      defaultValue={defaultValue}
      disabled={disabled}
      onValueChange={onValueChange}
      value={value}
    >
      <SelectPrimitive.Trigger
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        className="fs-select"
        id={id}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon aria-hidden="true">
          <Icon name="chevron-down" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="fs-select-content" position="popper">
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                className="fs-select-item"
                disabled={option.disabled}
                key={option.value}
                value={option.value}
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Icon name="check" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
