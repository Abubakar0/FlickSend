"use client";

import {
  Accordion,
  Alert,
  AppShell,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DropdownMenu,
  DropZone,
  EmptyState,
  ErrorCallout,
  ErrorPanel,
  Field,
  FileSummary,
  Heading,
  Icon,
  IconButton,
  Inline,
  Input,
  PersonChip,
  PersonRow,
  Popover,
  Progress,
  RadioGroup,
  RouteLabel,
  Section,
  Select,
  Separator,
  Sheet,
  Skeleton,
  Spinner,
  Stack,
  StatusBadge,
  Switch,
  Tabs,
  Tag,
  Text,
  Textarea,
  ThemeControl,
  ToastProvider,
  Tooltip,
  TransferCard,
  TransferHealth,
  useTheme,
  useToast,
  VerifiedProgress,
  workingBrand
} from "@flicksend/ui";

const navigation = [
  { id: "send", label: "Send", href: "#transfer-primitives" },
  { id: "transfers", label: "Transfers", href: "#status-and-progress" },
  { id: "people", label: "People", href: "#people-primitives" },
  { id: "settings", label: "Settings", href: "#foundations" }
];

function ShowcaseContent() {
  const theme = useTheme();
  const { notify } = useToast();

  return (
    <AppShell
      activeId="send"
      brand={workingBrand}
      navigation={navigation}
      utility={
        <ThemeControl preference={theme.preference} onPreferenceChange={theme.setPreference} />
      }
    >
      <main className="fs-showcase" id="main-content">
        <header className="fs-showcase__header">
          <div>
            <p className="fs-eyebrow">Development-only component showcase</p>
            <Heading as="h1" size="page">
              A calmer way to show serious work.
            </Heading>
            <Text tone="secondary">
              A fixture-only foundation for later FlickSend surfaces. No transfer, account, or
              filesystem behavior runs here.
            </Text>
          </div>
          <Inline gap="sm">
            <Badge tone="info">P3 foundation</Badge>
            <Tag>Windows-first layout</Tag>
          </Inline>
        </header>

        <Section id="foundations">
          <div className="fs-showcase__section-heading">
            <div>
              <p className="fs-eyebrow">Foundations</p>
              <Heading as="h2">Tokens shape the tone, not the workflow.</Heading>
            </div>
            <Text size="small" tone="secondary">
              Semantic color, spacing, radius, motion, and type tokens adapt across themes.
            </Text>
          </div>
          <div className="fs-showcase__grid">
            <Card>
              <Stack gap="md">
                <Heading as="h3" size="card">
                  Type and actions
                </Heading>
                <Text tone="secondary">
                  Readable hierarchy with tabular figures for high-value transfer metadata.
                </Text>
                <Inline gap="sm">
                  <Button>Primary action</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Quiet</Button>
                  <Button variant="danger">Danger</Button>
                </Inline>
                <Inline gap="sm">
                  <Button loading>Preparing</Button>
                  <Tooltip content="A named icon action">
                    <IconButton aria-label="Open options">
                      <Icon name="more" />
                    </IconButton>
                  </Tooltip>
                  <Spinner label="Loading showcase state" />
                </Inline>
              </Stack>
            </Card>
            <Card>
              <Stack gap="md">
                <Heading as="h3" size="card">
                  Surfaces and feedback
                </Heading>
                <Alert title="A clear, calm system" tone="info">
                  <p>Status uses words, shape, icons, and color together.</p>
                </Alert>
                <Inline gap="sm">
                  <Badge tone="success">Verified</Badge>
                  <Badge tone="recovering">Reconnecting</Badge>
                  <Badge tone="danger">Needs attention</Badge>
                </Inline>
                <div className="fs-showcase__skeletons">
                  <Skeleton />
                  <Skeleton />
                  <Skeleton />
                </div>
              </Stack>
            </Card>
          </div>
        </Section>

        <Section id="status-and-progress">
          <div className="fs-showcase__section-heading">
            <div>
              <p className="fs-eyebrow">Transfer states</p>
              <Heading as="h2">One progress language, grounded in verification.</Heading>
            </div>
            <Inline gap="sm">
              <RouteLabel route="Direct" />
              <RouteLabel route="Relayed" />
            </Inline>
          </div>
          <div className="fs-showcase__grid fs-showcase__grid--transfer">
            <Card>
              <Stack gap="lg">
                <div className="fs-showcase__card-heading">
                  <Heading as="h3" size="card">
                    Progress anatomy
                  </Heading>
                  <StatusBadge state="TRANSFERRING" />
                </div>
                <VerifiedProgress label="Project transfer" transferred={67} verified={63} />
                <TransferHealth confidence="LOW" state="SLOWER_THAN_EXPECTED" />
                <Progress
                  indeterminate
                  label="Preparing media"
                  supportingText="This can take a moment for a large folder."
                />
              </Stack>
            </Card>
            <Card>
              <Stack gap="md">
                <Heading as="h3" size="card">
                  Product state semantics
                </Heading>
                <div className="fs-showcase__status-list">
                  <StatusBadge state="WAITING_FOR_RECIPIENT" />
                  <StatusBadge state="RECONNECTING" />
                  <StatusBadge state="VERIFYING" />
                  <StatusBadge state="COMPLETED" />
                  <StatusBadge state="FAILED" />
                </div>
                <ErrorCallout
                  error={{
                    kind: "recovering",
                    title: "Reconnecting",
                    explanation: "The connection was interrupted. Your verified progress is safe.",
                    recommendedAction: "Keep FlickSend open while it reconnects.",
                    retryable: true
                  }}
                  onRetry={() =>
                    notify({ title: "Retry requested", description: "Fixture action only." })
                  }
                />
                <ErrorPanel
                  error={{
                    kind: "terminal",
                    title:
                      "This synthetic fixture demonstrates a deliberately long error title without clipping",
                    explanation:
                      "This is synthetic product copy for responsive review. It explains a terminal condition in plain language without exposing protocol data, network addresses, credentials, transfer identifiers, or local paths.",
                    recommendedAction:
                      "Review the visible guidance and begin a new transfer only when the future workflow supports it.",
                    retryable: false,
                    supportReference: "P3-SHOWCASE-ERROR"
                  }}
                />
              </Stack>
            </Card>
          </div>
        </Section>

        <Section id="transfer-primitives">
          <div className="fs-showcase__section-heading">
            <div>
              <p className="fs-eyebrow">Transfer primitives</p>
              <Heading as="h2">Large work stays scannable.</Heading>
            </div>
            <Text size="small" tone="secondary">
              Synthetic fixture data only.
            </Text>
          </div>
          <div className="fs-showcase__grid fs-showcase__grid--transfer">
            <Stack gap="md">
              <TransferCard
                direction="sent"
                etaMs={5820000}
                fileCount={23421}
                folderCount={1}
                health="GOOD"
                person={{ name: "Alex Morgan", presence: "available" }}
                progress={67}
                route="Direct"
                sizeBytes={184000000000}
                speedBytesPerSecond={12400000}
                status="TRANSFERRING"
                timestamp="Started 14 min ago"
                verifiedProgress={63}
              />
              <FileSummary
                fileCount={23421}
                folderCount={1}
                name="synthetic-campaign-deliverables-with-an-intentionally-long-descriptive-name-for-responsive-layout-review.zip"
                sizeBytes={184000000000}
              />
            </Stack>
            <Stack gap="md">
              <DropZone
                onSelectFiles={() =>
                  notify({ title: "Files selected", description: "Fixture action only." })
                }
                onSelectFolder={() =>
                  notify({ title: "Folder selected", description: "Fixture action only." })
                }
                state="drag-active"
              />
              <EmptyState
                description="Transfers will appear here when they need your attention."
                title="No active transfers"
              />
            </Stack>
          </div>
        </Section>

        <Section id="people-primitives">
          <div className="fs-showcase__section-heading">
            <div>
              <p className="fs-eyebrow">People</p>
              <Heading as="h2">Simple, present, and never social-network busy.</Heading>
            </div>
            <PersonChip person={{ name: "Jordan Lee", presence: "unknown" }} />
          </div>
          <Card>
            <Stack gap="sm">
              <PersonRow
                action={
                  <Button size="sm" variant="secondary">
                    Select
                  </Button>
                }
                person={{
                  name: "Alex Morgan",
                  presence: "available",
                  subtitle: "Available for a transfer"
                }}
              />
              <Separator />
              <PersonRow
                person={{
                  name: "Aurelia Montgomery-Smythe-Rivera",
                  presence: "available",
                  subtitle: "Synthetic long-name fixture for responsive review"
                }}
              />
              <Separator />
              <PersonRow
                action={
                  <Button size="sm" variant="ghost">
                    View
                  </Button>
                }
                person={{
                  name: "Jordan Lee",
                  presence: "unknown",
                  subtitle: "Availability unknown"
                }}
              />
              <Separator />
              <PersonRow
                person={{
                  name: "Sam Taylor",
                  presence: "unavailable",
                  subtitle: "Not available right now"
                }}
              />
            </Stack>
          </Card>
        </Section>

        <Section id="forms-and-overlays">
          <div className="fs-showcase__section-heading">
            <div>
              <p className="fs-eyebrow">Forms and overlays</p>
              <Heading as="h2">Focused choices with keyboard-first behavior.</Heading>
            </div>
          </div>
          <div className="fs-showcase__grid">
            <Card>
              <Stack gap="md">
                <Field
                  description="Fixture input with an explicit label and help text."
                  id="project-note"
                  label="Transfer note"
                  optional
                >
                  <Input id="project-note" placeholder="Optional note" />
                </Field>
                <Field error="Choose a person before continuing." id="recipient" label="Recipient">
                  <Input id="recipient" value="" readOnly />
                </Field>
                <Field id="route" label="Preferred route">
                  <Select
                    ariaLabel="Preferred route"
                    id="route"
                    options={[
                      { label: "Direct when possible", value: "direct" },
                      { label: "Relayed when needed", value: "relayed" }
                    ]}
                    placeholder="Choose a safe route label"
                  />
                </Field>
                <Checkbox id="privacy" label="Keep this note private" />
                <Switch
                  description="Fixture preference only; no account storage."
                  id="appearance"
                  label="Show a calmer contrast mode"
                />
                <RadioGroup
                  label="Transfer view"
                  name="transfer-view"
                  options={[
                    { label: "Compact", value: "compact" },
                    { label: "Comfortable", value: "comfortable" }
                  ]}
                  defaultValue="comfortable"
                />
              </Stack>
            </Card>
            <Card>
              <Stack gap="md">
                <Heading as="h3" size="card">
                  Focused decisions
                </Heading>
                <Inline gap="sm">
                  <Popover
                    content={
                      <Stack gap="sm">
                        <Heading as="h3" size="card">
                          Safe product labels
                        </Heading>
                        <Text size="small" tone="secondary">
                          Direct and Relayed are the only route labels exposed here.
                        </Text>
                      </Stack>
                    }
                    trigger={<Button variant="secondary">Open popover</Button>}
                  />
                  <DropdownMenu
                    label="More showcase options"
                    items={[{ label: "Duplicate fixture" }, { label: "Archive fixture" }]}
                    trigger={
                      <IconButton aria-label="Open more options">
                        <Icon name="more" />
                      </IconButton>
                    }
                  />
                  <Dialog
                    description="This is an isolated composition demo."
                    footer={<Button>Done</Button>}
                    title="Dialog primitive"
                    trigger={<Button variant="ghost">Open dialog</Button>}
                  >
                    <Text>
                      Normal workflow decisions can use a focused modal without turning the app into
                      a modal maze.
                    </Text>
                  </Dialog>
                </Inline>
                <ConfirmDialog
                  actionLabel="Cancel fixture"
                  description="This pattern is for a future transfer cancellation confirmation."
                  onConfirm={() =>
                    notify({ title: "Fixture canceled", description: "No transfer exists in P3." })
                  }
                  title="Cancel this transfer?"
                  trigger={<Button variant="danger">Open confirmation</Button>}
                >
                  <Text>Verified work is never altered by this showcase action.</Text>
                </ConfirmDialog>
                <Sheet
                  description="Presentation-only side panel."
                  title="Details panel"
                  trigger={<Button variant="secondary">Open panel</Button>}
                >
                  <Textarea
                    aria-label="Fixture note"
                    placeholder="A small focused panel can hold simple content."
                  />
                </Sheet>
                <Accordion
                  items={[
                    {
                      value: "accessibility",
                      title: "Keyboard behavior",
                      content:
                        "Buttons, overlays, menus, tabs, and form controls preserve native or Radix keyboard semantics."
                    },
                    {
                      value: "motion",
                      title: "Motion behavior",
                      content:
                        "Reduced-motion preferences disable nonessential animation without hiding status."
                    }
                  ]}
                />
              </Stack>
            </Card>
          </div>
        </Section>

        <Section>
          <Tabs
            defaultValue="light"
            items={[
              {
                value: "light",
                label: "System",
                content: (
                  <Text tone="secondary">
                    Use the theme control in the shell to follow system, light, or dark preference.
                  </Text>
                )
              },
              {
                value: "limits",
                label: "Boundaries",
                content: (
                  <Text tone="secondary">
                    This route is visual QA only. It never starts real transfers or connects to
                    signaling.
                  </Text>
                )
              }
            ]}
          />
        </Section>
      </main>
    </AppShell>
  );
}

export function DesignSystemShowcase() {
  return (
    <ToastProvider>
      <ShowcaseContent />
    </ToastProvider>
  );
}
