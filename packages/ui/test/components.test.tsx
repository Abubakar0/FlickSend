import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Avatar,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DropdownMenu,
  DropZone,
  ErrorCallout,
  ErrorPanel,
  Field,
  FileSummary,
  Icon,
  IconButton,
  Input,
  PresenceIndicator,
  Progress,
  RadioGroup,
  Spinner,
  StatusBadge,
  Switch,
  Tabs,
  ThemeControl,
  ThemeProvider,
  useTheme
} from "../src/index.js";

function ThemeExample() {
  const theme = useTheme();
  return <ThemeControl preference={theme.preference} onPreferenceChange={theme.setPreference} />;
}

describe("UI primitives", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    cleanup();
  });

  it("prevents duplicate loading actions and exposes busy semantics", () => {
    render(<Button loading>Send files</Button>);
    const button = screen.getByRole("button", { name: "Send files" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("associates fields and validation messages with visible text", () => {
    render(
      <Field error="Choose a person before continuing." id="recipient" label="Recipient">
        <Input id="recipient" />
      </Field>
    );
    const input = screen.getByLabelText("Recipient");
    expect(input).toHaveAttribute("aria-describedby", "recipient-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a person before continuing.");
  });

  it("exposes a labelled progressbar and a text status", () => {
    render(
      <>
        <Progress label="Project transfer" value={67} verifiedValue={63} />
        <StatusBadge state="RECONNECTING" />
      </>
    );
    expect(screen.getByRole("progressbar", { name: "Project transfer" })).toHaveAttribute(
      "aria-valuenow",
      "67"
    );
    expect(screen.getByText("Reconnecting")).toBeVisible();
  });

  it("keeps decorative avatars hidden and exposes loading and verified-progress context", () => {
    render(
      <>
        <Avatar name="Alex Morgan" />
        <Spinner label="Loading transfer details" />
        <Progress
          label="Transfer progress"
          supportingText="Verified progress: 63%"
          value={67}
          verifiedValue={63}
        />
      </>
    );
    expect(screen.getByText("AM")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading transfer details");
    const progress = screen.getByRole("progressbar", { name: "Transfer progress" });
    const descriptionId = progress.getAttribute("aria-describedby");
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId ?? "")).toHaveTextContent(
      "Verified progress: 63%"
    );
  });

  it("supports keyboard dialog dismissal", async () => {
    const user = userEvent.setup();
    render(
      <Dialog
        description="A focused fixture description."
        title="Fixture details"
        trigger={<Button>Open details</Button>}
      >
        <p>Fixture content</p>
      </Dialog>
    );
    await user.click(screen.getByRole("button", { name: "Open details" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Fixture details");
    expect(dialog).toHaveAccessibleDescription("A focused fixture description.");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("notifies a controlled dialog when it opens and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog
        onOpenChange={onOpenChange}
        title="Controlled dialog"
        trigger={<Button>Open controlled</Button>}
      >
        <p>Controlled fixture content</p>
      </Dialog>
    );
    await user.click(screen.getByRole("button", { name: "Open controlled" }));
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(onOpenChange).toHaveBeenNthCalledWith(1, true);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("uses native/Radix checkbox semantics", async () => {
    const user = userEvent.setup();
    render(<Checkbox id="privacy" label="Keep this private" />);
    const checkbox = screen.getByRole("checkbox", { name: "Keep this private" });
    await user.click(checkbox);
    expect(checkbox).toHaveAttribute("data-state", "checked");
  });

  it("persists an explicit theme choice locally", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeExample />
      </ThemeProvider>
    );
    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("flicksend-theme-preference")).toBe("dark");
  });

  it("restores a persisted theme and leaves system preference unforced", async () => {
    window.localStorage.setItem("flicksend-theme-preference", "light");
    const { unmount } = render(
      <ThemeProvider>
        <ThemeExample />
      </ThemeProvider>
    );
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    unmount();

    window.localStorage.clear();
    render(
      <ThemeProvider>
        <ThemeExample />
      </ThemeProvider>
    );
    await waitFor(() => expect(document.documentElement).not.toHaveAttribute("data-theme"));
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
  });

  it("exposes indeterminate progress without a false numeric value", () => {
    render(<Progress indeterminate label="Preparing media" />);
    const progress = screen.getByRole("progressbar", { name: "Preparing media" });
    expect(progress).not.toHaveAttribute("aria-valuenow");
    expect(progress).toHaveAttribute("aria-valuetext", "Preparing media: in progress");
  });

  it("keeps recoverable errors distinct from terminal errors and renders safe references", () => {
    render(
      <>
        <ErrorCallout
          error={{
            kind: "recovering",
            title: "Reconnecting",
            explanation: "Verified progress is safe.",
            recommendedAction: "Keep this page open.",
            retryable: true,
            supportReference: "P3-RECOVERY"
          }}
        />
        <ErrorPanel
          error={{
            kind: "terminal",
            title: "Transfer could not continue",
            explanation: "Nothing was marked complete.",
            recommendedAction: "Start again when ready.",
            retryable: false
          }}
        />
      </>
    );
    expect(screen.getByText("Reconnecting").closest("section")).toHaveClass("fs-alert--info");
    expect(screen.getByText("Transfer could not continue").closest("section")).toHaveClass(
      "fs-error-panel"
    );
    expect(screen.getByText("Support reference: P3-RECOVERY")).toBeVisible();
  });

  it("preserves unknown presence and applies supported drop-zone states", () => {
    const { rerender } = render(
      <>
        <PresenceIndicator presence="available" />
        <PresenceIndicator presence="unavailable" />
        <PresenceIndicator presence="unknown" />
        <DropZone state="drag-active" />
      </>
    );
    expect(screen.getByRole("img", { name: "Availability unknown" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Source selection" })).toHaveClass(
      "fs-drop-zone--drag-active"
    );

    rerender(<DropZone disabled state="invalid" />);
    expect(screen.getByRole("region", { name: "Source selection" })).toHaveClass(
      "fs-drop-zone--invalid",
      "is-disabled"
    );
    expect(screen.getByRole("button", { name: "Select files" })).toBeDisabled();
  });

  it("keeps file summaries to a display name rather than a path", () => {
    render(
      <FileSummary
        fileCount={23_421}
        name="C:\\private\\synthetic-campaign-deliverables.zip"
        sizeBytes={184_000_000_000}
      />
    );
    expect(screen.getByText("synthetic-campaign-deliverables.zip")).toBeVisible();
    expect(screen.queryByText(/C:\\private/)).not.toBeInTheDocument();
  });

  it("preserves keyboard operation for dialogs, confirmations, tabs, menus, radios, and switches", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ConfirmDialog
          actionLabel="Confirm fixture"
          description="Confirming does not change a transfer."
          onConfirm={() => undefined}
          title="Confirm fixture?"
          trigger={<Button>Open confirmation</Button>}
        >
          <p>Fixture only.</p>
        </ConfirmDialog>
        <DropdownMenu
          items={[{ label: "First action" }, { label: "Second action" }]}
          label="Fixture actions"
          trigger={
            <IconButton aria-label="Open fixture actions">
              <Icon name="more" />
            </IconButton>
          }
        />
        <Tabs
          defaultValue="first"
          items={[
            { value: "first", label: "First", content: <p>First panel</p> },
            { value: "second", label: "Second", content: <p>Second panel</p> }
          ]}
        />
        <RadioGroup
          defaultValue="compact"
          label="View density"
          name="density"
          options={[
            { label: "Compact", value: "compact" },
            { label: "Comfortable", value: "comfortable" }
          ]}
        />
        <Switch id="fixture-switch" label="Fixture switch" />
      </>
    );

    await user.click(screen.getByRole("button", { name: "Open confirmation" }));
    const confirmation = screen.getByRole("alertdialog", { name: "Confirm fixture?" });
    expect(confirmation).toHaveAccessibleDescription("Confirming does not change a transfer.");
    const cancel = screen.getByRole("button", { name: "Keep transfer" });
    expect(cancel).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: "Confirm fixture" })).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(cancel).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    const menuButton = screen.getByRole("button", { name: "Open fixture actions" });
    menuButton.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: "First action" })).toBeVisible();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Second action" })).toHaveFocus();
    await user.keyboard("{Escape}");

    const firstTab = screen.getByRole("tab", { name: "First" });
    firstTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Second" })).toHaveAttribute("data-state", "active");

    await user.click(screen.getByRole("radio", { name: "Comfortable" }));
    expect(screen.getByRole("radio", { name: "Comfortable" })).toHaveAttribute(
      "data-state",
      "checked"
    );
    const fixtureSwitch = screen.getByRole("switch", { name: "Fixture switch" });
    fixtureSwitch.focus();
    await user.keyboard(" ");
    expect(fixtureSwitch).toHaveAttribute("data-state", "checked");
  });
});
