import type { RpcOutput } from "@getpaseo/plugin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Switch, TextInput as RNTextInput, Text, View } from "react-native";
import {
  openExternalUrl,
  usePaseo,
  useRpc,
  type PluginScreenProps,
} from "@getpaseo/plugin/client";
import {
  FlatList,
  Icon,
  ScrollView,
  Modal,
  Markdown,
  TextInput,
  useToast,
} from "@getpaseo/plugin/client/ui";
import {
  startPrompt,
  defaultSprints,
  listSprintsRpc,
  assignRpc,
  listTicketsRpc,
  listTransitionsRpc,
  searchAssigneesRpc,
  remoteBranchesRpc,
  transitionRpc,
  searchTicketsRpc,
  ticketDetailsRpc,
  type Sprint,
} from "../shared/jira";

function Spinner({ color }: { color: string }) {
  return <ActivityIndicator color={color} style={{ paddingVertical: 16 }} />;
}

type Ticket = RpcOutput<typeof searchTicketsRpc>["items"][number];
type Theme = PluginScreenProps["theme"];

function useStyles(theme: Theme, compact: boolean) {
  return useMemo(
    () => ({
      screen: { flex: 1, padding: compact ? 12 : 28, gap: 18, width: "100%" as const, maxWidth: 1440, alignSelf: "center" as const, backgroundColor: theme.colors.surface0 },
      text: { color: theme.colors.foreground },
      muted: { color: theme.colors.foregroundMuted },
      accent: { color: theme.colors.accent, fontWeight: "600" as const },
      error: { color: theme.colors.statusDanger },
      input: {
        color: theme.colors.foreground,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 6,
        padding: 8,
      },
      searchBox: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 10,
        minHeight: 46,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      card: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 16,
        padding: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      ticketCard: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        overflow: "hidden" as const,
      },
      // To the left of the button, inside its own card: list cells stack, so anything above/below gets covered.
      tooltip: {
        position: "absolute" as const,
        right: "100%" as const,
        top: -4,
        marginRight: 8,
        width: 240,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
        zIndex: 20,
      },
      startButton: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.accent,
      },
      chip: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      menu: {
        position: "absolute" as const,
        top: "100%" as const,
        left: 0,
        marginTop: 4,
        width: 340,
        padding: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        shadowColor: "#000",
        shadowOpacity: 0.3,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
      },
      menuGroup: {
        color: theme.colors.foregroundMuted,
        fontSize: 11,
        textTransform: "uppercase" as const,
        paddingHorizontal: 8,
        paddingTop: 10,
        paddingBottom: 4,
      },
      menuItem: { paddingHorizontal: 8, paddingVertical: 7, borderRadius: 6 },
      fieldLabel: { color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "500" as const },
      fieldBorder: { borderColor: theme.colors.border },
      field: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      // outlineStyle removes the browser focus ring on web; the surrounding box is the visual field.
      bareInput: { flex: 1, color: theme.colors.foreground, paddingVertical: 10, fontSize: 14, outlineStyle: "none" as never },
      pickerBack: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        alignSelf: "flex-start" as const,
        paddingVertical: 4,
        paddingHorizontal: 6,
        marginLeft: -6,
        borderRadius: 6,
      },
      pickerRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
      },
      rowSelected: { backgroundColor: theme.colors.surface2 },
      rowPressed: { backgroundColor: theme.colors.surface2, opacity: 0.85 },
      selectTrigger: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        maxWidth: 320,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      button: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: theme.colors.accent },
      buttonText: { color: theme.colors.accentForeground },
    }),
    [theme, compact],
  );
}

type Styles = ReturnType<typeof useStyles>;

type PickerOption = { value: string; group: string; label: string };
type Picking = { label: string; options: PickerOption[]; value: string; onChange(value: string): void };

function Field({ label, styles, children }: { label: string; styles: Styles; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function PickerTrigger({ picking, onOpen, styles }: { picking: Picking; onOpen(p: Picking): void; styles: Styles }) {
  const current = picking.options.find((o) => o.value === picking.value);
  return (
    <Field label={picking.label} styles={styles}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Choose ${picking.label}`}
        style={styles.field}
        onPress={() => onOpen(picking)}
      >
        <Text style={[styles.text, { flex: 1 }]} numberOfLines={1}>
          {current
            ? current.group
              ? `${current.group} · ${current.label}`
              : current.label
            : `Choose ${picking.label.toLowerCase()}`}
        </Text>
        <Icon name="ChevronRight" size={16} color={styles.muted.color} />
      </Pressable>
    </Field>
  );
}

// ponytail: the picker replaces the modal body instead of floating — the plugin Modal clips overlays
// and offers no popover API. Swap for a host popover if Paseo adds one for modals.
function PickerView({ picking, onDone, styles }: { picking: Picking; onDone(): void; styles: Styles }) {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const groups = new Map<string, PickerOption[]>();
  for (const o of picking.options) {
    if (needle && !`${o.group} ${o.label} ${o.value}`.toLowerCase().includes(needle)) continue;
    groups.set(o.group, [...(groups.get(o.group) ?? []), o]);
  }
  return (
    // Fixed height so the dialog doesn't jump in size as the filter narrows the list.
    <View style={{ gap: 12, height: 480 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onDone}
        style={({ pressed }) => [styles.pickerBack, pressed && styles.rowPressed]}
      >
        <Icon name="ArrowLeft" size={16} color={styles.text.color} />
        <Text style={[styles.text, { fontSize: 15, fontWeight: "600" }]}>{picking.label}</Text>
      </Pressable>
      <View style={styles.searchBox}>
        <Icon name="Search" size={16} color={styles.muted.color} />
        <RNTextInput
          style={styles.bareInput}
          value={filter}
          onChangeText={setFilter}
          placeholder={`Search ${picking.label.toLowerCase()}`}
          placeholderTextColor={styles.muted.color}
          autoFocus
          accessibilityLabel={`Search ${picking.label}`}
        />
        {filter ? (
          <Pressable accessibilityLabel="Clear search" onPress={() => setFilter("")}>
            <Icon name="X" size={14} color={styles.muted.color} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 2 }}>
        {[...groups].map(([group, items]) => (
          <View key={group} style={{ gap: 2 }}>
            {group ? <Text style={styles.menuGroup}>{group}</Text> : null}
            {items.map((o) => {
              const selected = o.value === picking.value;
              return (
                <Pressable
                  key={o.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [styles.pickerRow, selected && styles.rowSelected, pressed && styles.rowPressed]}
                  onPress={() => {
                    picking.onChange(o.value);
                    onDone();
                  }}
                >
                  <Text style={[styles.text, { flex: 1 }, selected && { fontWeight: "600" }]} numberOfLines={1}>
                    {o.label}
                  </Text>
                  {selected ? <Icon name="Check" size={16} color={styles.accent.color} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        {groups.size === 0 ? (
          <Text style={[styles.muted, { textAlign: "center", padding: 24 }]}>No matches for “{filter}”</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ticketAttachment(ticket: Ticket) {
  return {
    type: "text" as const,
    mimeType: "text/plain" as const,
    title: `${ticket.identifier} ${ticket.title}`,
    text: `Jira ticket ${ticket.identifier}: ${ticket.title}\n${ticket.url}`,
    externalResource: {
      provider: "paseo-jira",
      providerLabel: "Jira ticket",
      resourceType: "issue",
      id: ticket.id,
      identifier: ticket.identifier,
      title: ticket.title,
      url: ticket.url,
    },
  };
}

function StartModal({
  ticket,
  onClose,
  styles,
  navigation,
  compact,
}: {
  compact: boolean;
  ticket: Ticket;
  onClose(): void;
  styles: Styles;
  navigation: PluginScreenProps["navigation"];
}) {
  const paseo = usePaseo();
  const listBranches = useRpc(remoteBranchesRpc);
  const toast = useToast();
  const [prompt, setPrompt] = useState(() => startPrompt(ticket.identifier));
  const [picking, setPicking] = useState<Picking | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [useWorktree, setUseWorktree] = useState(false);
  const [baseBranch, setBaseBranch] = useState("");
  const [model, setModel] = useState("");

  const models = useQuery({
    queryKey: ["models"],
    queryFn: async () => {
      const { providers } = await paseo.providers.listAvailable();
      const lists = await Promise.all(
        providers.filter((p) => p.available).map((p) => paseo.providers.listModels(p.provider)),
      );
      return lists.flatMap((l) =>
        (l.models ?? [])
          .filter((m) => m.isSelectable !== false)
          .map((m) => ({ value: `${l.provider}/${m.id}`, group: l.provider, label: m.label, isDefault: m.isDefault })),
      );
    },
  });
  useEffect(() => {
    if (!model && models.data?.[0]) setModel((models.data.find((m) => m.isDefault) ?? models.data[0]).value);
  }, [models.data, model]);

  const workspaces = useQuery({
    queryKey: ["projects"],
    queryFn: async () =>
      (await paseo.projects.list()).projects
        .filter((p) => p.projectKind === "git")
        .map((p) => ({ id: p.projectId, name: p.projectCustomName || p.projectDisplayName, root: p.projectRootPath })),
  });
  useEffect(() => {
    if (!workspaceId && workspaces.data?.[0]) setWorkspaceId(workspaces.data[0].id);
  }, [workspaces.data, workspaceId]);

  const projectRoot = workspaces.data?.find((p) => p.id === workspaceId)?.root;
  const branches = useQuery({
    queryKey: ["branches", projectRoot],
    queryFn: () => listBranches({ cwd: projectRoot! }),
    enabled: useWorktree && !!projectRoot,
  });
  useEffect(() => {
    if (branches.data) setBaseBranch(branches.data.defaultBranch ?? branches.data.branches[0] ?? "");
  }, [branches.data]);


  const start = useMutation({
    mutationFn: async () => {
      // Same shape Paseo builds for a composer plugin attachment, so the message shows the ticket as a card.
      const attachments = [ticketAttachment(ticket)];
      const project = workspaces.data?.find((p) => p.id === workspaceId);
      if (!project) throw new Error("Choose a project");
      const cwd = project.root;
      if (!model) throw new Error("Choose a model");
      const config = { provider: model };
      if (!useWorktree) {
        // Opens (or reuses) the workspace rooted at the repo directory itself.
        const workspace = await paseo.workspaces.open(cwd);
        const agent = await workspace.agents.create({ config, prompt, attachments, title: ticket.identifier });
        return { agentId: agent.id, workspaceId: workspace.id };
      }
      if (!baseBranch) throw new Error("Choose a base branch");
      const refName = baseBranch;
      const created = await paseo.workspaces.create({
        source: { kind: "worktree", cwd, action: "branch-off", refName, branchName: ticket.identifier },
        title: `${ticket.identifier} ${ticket.title}`,
        agent: { cwd, config, prompt, attachments, title: ticket.identifier },
      });
      return { workspaceId: created.id };
    },
    onSuccess: (result) => {
      onClose();
      toast.show(`Started agent for ${ticket.identifier}`, { variant: "success" });
      if ("agentId" in result && result.agentId) navigation?.openAgent({ agentId: result.agentId });
      else navigation?.openWorkspace({ workspaceId: result.workspaceId });
    },
  });

  const options = (workspaces.data ?? []).map((p) => ({ label: p.name, value: p.id, group: "" }));

  return (
    <Modal title={`Start ${ticket.identifier}`} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content>
        {picking ? (
          <PickerView picking={picking} onDone={() => setPicking(null)} styles={styles} />
        ) : (
        <>
        <Text style={[styles.text, { fontSize: 15, fontWeight: "500" }]}>{ticket.title}</Text>
        <Field label="Prompt" styles={styles}>
          <TextInput
            style={[styles.input, { minHeight: 88, textAlignVertical: "top", padding: 12, borderRadius: 8 }]}
            multiline
            value={prompt}
            onChangeText={setPrompt}
            accessibilityLabel="Prompt"
          />
        </Field>
        {workspaces.isPending ? (
          <Spinner color={styles.muted.color} />
        ) : workspaces.error ? (
          <Text style={styles.error}>{workspaces.error.message}</Text>
        ) : (
          <PickerTrigger
            picking={{ label: "Project", options, value: workspaceId, onChange: setWorkspaceId }}
            onOpen={setPicking}
            styles={styles}
          />
        )}
        {models.error ? (
          <Text style={styles.error}>{models.error.message}</Text>
        ) : models.data ? (
          <PickerTrigger
            picking={{ label: "Model", options: models.data, value: model, onChange: setModel }}
            onOpen={setPicking}
            styles={styles}
          />
        ) : (
          <Spinner color={styles.muted.color} />
        )}
        <View style={[styles.field, { paddingVertical: 10 }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.text}>Use worktree</Text>
            <Text style={[styles.muted, { fontSize: 12 }]}>New branch {ticket.identifier} from a remote branch</Text>
          </View>
          <Switch
            value={useWorktree}
            onValueChange={setUseWorktree}
            trackColor={{ true: styles.accent.color, false: styles.fieldBorder.borderColor }}
            accessibilityLabel="Use worktree"
          />
        </View>
        {!useWorktree ? null : branches.error ? (
          <Text style={styles.error}>{branches.error.message}</Text>
        ) : branches.data ? (
          <PickerTrigger
            picking={{
              label: "Base branch",
              options: branches.data.branches.map((b) => ({ value: b, group: "origin", label: b.replace(/^origin\//, "") })),
              value: baseBranch,
              onChange: setBaseBranch,
            }}
            onOpen={setPicking}
            styles={styles}
          />
        ) : (
          <Spinner color={styles.muted.color} />
        )}
        {start.error ? <Text style={styles.error}>{start.error.message}</Text> : null}
        <Pressable
          accessibilityRole="button"
          style={[
            styles.button,
            { alignItems: "center", paddingVertical: 10, marginTop: 4, opacity: start.isPending ? 0.6 : 1 },
            compact ? null : { alignSelf: "flex-end", paddingHorizontal: 24 },
          ]}
          disabled={start.isPending || !model || (useWorktree && !baseBranch) || !workspaceId || !prompt.trim()}
          onPress={() => start.mutate()}
        >
          <Text style={[styles.buttonText, { fontWeight: "600" }]}>{start.isPending ? "Starting…" : "Start"}</Text>
        </Pressable>
        </>
        )}
      </Modal.Content>
    </Modal>
  );
}

type ListItem = RpcOutput<typeof listTicketsRpc>["items"][number];

function AssignModal({
  item,
  styles,
  onClose,
  onChanged,
}: {
  item: ListItem;
  styles: Styles;
  onClose(): void;
  onChanged(): void;
}) {
  const search = useRpc(searchAssigneesRpc);
  const assign = useRpc(assignRpc);
  const toast = useToast();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  // ponytail: debounce by hand; 250ms keeps Jira's user search from firing per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 250);
    return () => clearTimeout(t);
  }, [input]);
  const users = useQuery({
    queryKey: ["jira-assignees", item.key, query],
    queryFn: () => search({ key: item.key, query }),
    placeholderData: (prev) => prev,
  });
  const change = useMutation({
    mutationFn: (u: { accountId: string | null; displayName: string }) => assign({ key: item.key, accountId: u.accountId }),
    onSuccess: (_, u) => {
      toast.show(`${item.key} → ${u.displayName}`, { variant: "success" });
      onChanged();
      onClose();
    },
  });
  const me = users.data?.users.find((u) => u.accountId === users.data?.me);
  const row = (key: string, label: string, sub: string | null, target: { accountId: string | null; displayName: string }, current: boolean) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      disabled={change.isPending || current}
      onPress={() => change.mutate(target)}
      style={({ pressed }) => [styles.pickerRow, current && styles.rowSelected, pressed && styles.rowPressed]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.text} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text style={[styles.muted, { fontSize: 12 }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {change.isPending && change.variables?.accountId === target.accountId ? (
        <ActivityIndicator size="small" color={styles.muted.color} />
      ) : null}
      {current ? <Icon name="Check" size={16} color={styles.accent.color} /> : null}
    </Pressable>
  );

  return (
    <Modal title={`Assign · ${item.key}`} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content>
        <View style={{ gap: 12, height: 440 }}>
          <View style={styles.searchBox}>
            <Icon name="Search" size={16} color={styles.muted.color} />
            <RNTextInput
              style={styles.bareInput}
              value={input}
              onChangeText={setInput}
              placeholder="Search people"
              placeholderTextColor={styles.muted.color}
              autoFocus
              accessibilityLabel="Search people"
            />
            {users.isFetching ? <ActivityIndicator size="small" color={styles.muted.color} /> : null}
          </View>
          {change.error ? <Text style={styles.error}>{change.error.message}</Text> : null}
          {users.error ? <Text style={styles.error}>{users.error.message}</Text> : null}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 2 }}>
            {!query && me
              ? row("me", "Assign to me", me.displayName, me, item.assignee === me.displayName)
              : null}
            {!query
              ? row("none", "Unassigned", null, { accountId: null, displayName: "Unassigned" }, item.assignee === null)
              : null}
            {(users.data?.users ?? [])
              .filter((u) => query || u.accountId !== users.data?.me)
              .map((u) => row(u.accountId, u.displayName, u.email, u, item.assignee === u.displayName))}
            {users.data && users.data.users.length === 0 ? (
              <Text style={[styles.muted, { textAlign: "center", padding: 24 }]}>No people match “{query}”</Text>
            ) : null}
          </ScrollView>
        </View>
      </Modal.Content>
    </Modal>
  );
}

function StatusModal({
  item,
  styles,
  tone,
  onClose,
  onChanged,
}: {
  item: ListItem;
  styles: Styles;
  tone: Record<string, string>;
  onClose(): void;
  onChanged(): void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const listTransitions = useRpc(listTransitionsRpc);
  const transition = useRpc(transitionRpc);
  const toast = useToast();
  const transitions = useQuery({
    queryKey: ["jira-transitions", item.key],
    queryFn: () => listTransitions({ key: item.key }),
    staleTime: 0,
  });
  const change = useMutation({
    mutationFn: (t: { id: string; to: string }) => transition({ key: item.key, transitionId: t.id }),
    onSuccess: (_, t) => {
      toast.show(`${item.key} → ${t.to}`, { variant: "success" });
      onChanged();
      onClose();
    },
  });

  return (
    <Modal title={`Change status · ${item.key}`} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content>
        <Text style={[styles.text, { fontSize: 15, fontWeight: "500" }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.fieldLabel}>Current: {item.status}</Text>
        {transitions.isPending ? (
          <Spinner color={styles.muted.color} />
        ) : transitions.error ? (
          <Text style={styles.error}>{transitions.error.message}</Text>
        ) : transitions.data.transitions.length === 0 ? (
          <Text style={styles.muted}>No transitions available for this ticket.</Text>
        ) : (
          <View style={{ gap: 2 }}>
            {transitions.data.transitions.map((t) => {
              const current = t.to === item.status;
              const pending = change.isPending && change.variables?.id === t.id;
              const highlighted = !current && !change.isPending && (hoveredId === t.id || focusedId === t.id);
              return (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  disabled={change.isPending || current}
                  onHoverIn={() => setHoveredId(t.id)}
                  onHoverOut={() => setHoveredId(null)}
                  onFocus={() => setFocusedId(t.id)}
                  onBlur={() => setFocusedId(null)}
                  onPress={() => change.mutate(t)}
                  style={({ pressed }) => [styles.pickerRow, (current || highlighted) && styles.rowSelected, pressed && styles.rowPressed]}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone[t.toCategory] ?? styles.muted.color }} />
                  <Text style={[styles.text, { flex: 1 }, highlighted && { color: styles.accent.color }]} numberOfLines={1}>
                    {t.name === t.to ? t.to : `${t.name} → ${t.to}`}
                  </Text>
                  {pending ? <ActivityIndicator size="small" color={styles.muted.color} /> : null}
                  {current ? <Icon name="Check" size={16} color={styles.accent.color} /> : null}
                </Pressable>
              );
            })}
          </View>
        )}
        {change.error ? <Text style={styles.error}>{change.error.message}</Text> : null}
      </Modal.Content>
    </Modal>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function DetailField({ label, value, styles, compact }: { label: string; value: string; styles: Styles; compact: boolean }) {
  return (
    <View style={{ width: compact ? "100%" : "31%", minWidth: 150, flexGrow: 1, gap: 5 }}>
      <Text style={[styles.muted, { fontSize: 11, fontWeight: "600", textTransform: "uppercase" }]}>{label}</Text>
      <Text style={[styles.text, { fontSize: 13, lineHeight: 19 }]}>{value || "None"}</Text>
    </View>
  );
}

function TicketDetails({ item, styles, compact }: { item: ListItem; styles: Styles; compact: boolean }) {
  const getTicket = useRpc(ticketDetailsRpc);
  const details = useQuery({
    queryKey: ["jira-ticket", item.key],
    queryFn: () => getTicket({ key: item.key }),
    staleTime: 60_000,
  });
  const ticket = details.data;

  return (
    <View
      style={{
        gap: 18,
        padding: compact ? 14 : 20,
        borderTopWidth: 1,
        borderTopColor: styles.fieldBorder.borderColor,
        backgroundColor: styles.screen.backgroundColor,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text style={[styles.text, { fontSize: 14, fontWeight: "600" }]}>Ticket details</Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ${item.key} in Jira`}
          onPress={() => void openExternalUrl(item.url)}
          style={({ pressed }) => ({
            minHeight: 32,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 8,
            borderRadius: 6,
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Text style={[styles.accent, { fontSize: 12 }]}>Open in Jira</Text>
          <Icon name="ExternalLink" size={13} color={styles.accent.color} />
        </Pressable>
      </View>
      {details.isPending ? (
        <View style={{ alignItems: "center", paddingVertical: 20, gap: 8 }}>
          <ActivityIndicator color={styles.muted.color} />
          <Text style={[styles.muted, { fontSize: 12 }]}>Loading ticket details…</Text>
        </View>
      ) : details.error ? (
        <View style={{ gap: 12 }}>
          <Text style={styles.error}>{details.error.message}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Retry loading ${item.key}`}
            disabled={details.isFetching}
            onPress={() => void details.refetch()}
            style={[styles.chip, { alignSelf: "flex-start", minHeight: 32, opacity: details.isFetching ? 0.6 : 1 }]}
          >
            <Icon name="RefreshCw" size={13} color={styles.muted.color} />
            <Text style={[styles.muted, { fontSize: 12 }]}>{details.isFetching ? "Retrying…" : "Retry"}</Text>
          </Pressable>
        </View>
      ) : ticket ? (
        <>
          <View style={{ gap: 8 }}>
            <Text style={[styles.muted, { fontSize: 11, fontWeight: "600", textTransform: "uppercase" }]}>Description</Text>
            <Markdown>
              {ticket.description || "No description provided."}
            </Markdown>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
            <DetailField label="Type" value={ticket.type} styles={styles} compact={compact} />
            <DetailField label="Priority" value={ticket.priority} styles={styles} compact={compact} />
            <DetailField label="Reporter" value={ticket.reporter ?? "Unassigned"} styles={styles} compact={compact} />
            <DetailField label="Assignee" value={ticket.assignee ?? "Unassigned"} styles={styles} compact={compact} />
            <DetailField label="Created" value={formatDate(ticket.created)} styles={styles} compact={compact} />
            <DetailField label="Updated" value={formatDate(ticket.updated)} styles={styles} compact={compact} />
          </View>
          {([
            ["Labels", ticket.labels],
            ["Components", ticket.components],
          ] as const).filter(([, values]) => values.length > 0).map(([label, values]) => (
            <View key={label} style={{ gap: 8 }}>
              <Text style={[styles.muted, { fontSize: 11, fontWeight: "600", textTransform: "uppercase" }]}>{label}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {values.map((value) => (
                  <View key={value} style={[styles.chip, { maxWidth: "100%", minWidth: 0, paddingVertical: 3, backgroundColor: styles.rowSelected.backgroundColor }]}>
                    <Text style={[styles.muted, { flexShrink: 1, fontSize: 12 }]}>{value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

type Row = { type: "header"; key: string; title: string; count: number } | { type: "ticket"; key: string; item: ListItem };

const ALL_ACTIVE = "active";

function sprintLabel(sp: Sprint) {
  return sp.state === "active" ? `${sp.name} · active` : sp.state === "future" ? `${sp.name} · upcoming` : sp.name;
}

/** Start is only enabled for "To Do"-category tickets; otherwise hover (or tap on touch) explains why. */
function StartButton({ item, styles, onStart }: { item: ListItem; styles: Styles; onStart(): void }) {
  const [hovered, setHovered] = useState(false);
  const toast = useToast();
  const startable = item.statusCategory === "new";
  const reason = `Only To Do tickets can be started. ${item.key} is “${item.status}”.`;
  const color = startable ? styles.accent.color : styles.muted.color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={startable ? `Start ${item.key}` : reason}
      accessibilityState={{ disabled: !startable }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => (startable ? onStart() : toast.show(reason))}
      style={({ pressed }) => [
        styles.startButton,
        { minHeight: 32, opacity: startable && pressed ? 0.7 : 1 },
        !startable && { borderColor: styles.fieldBorder.borderColor },
      ]}
    >
      {/* Dim the content, not the Pressable, so the tooltip stays fully opaque. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, opacity: startable ? 1 : 0.4 }}>
        <Icon name="Play" size={12} color={color} />
        <Text style={{ color, fontWeight: "600", fontSize: 13 }}>Start</Text>
      </View>
      {hovered && !startable ? (
        <View pointerEvents="none" style={styles.tooltip}>
          <Text style={{ color: styles.text.color, fontSize: 12 }}>{reason}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function JiraScreen({ theme, layout, navigation, onOpenSettings }: PluginScreenProps & { onOpenSettings?: () => void }) {
  const queryClient = useQueryClient();
  const styles = useStyles(theme, layout.compact);
  const list = useRpc(listTicketsRpc);
  const listSprints = useRpc(listSprintsRpc);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [sprint, setSprint] = useState(ALL_ACTIVE);
  const [mine, setMine] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [transitioning, setTransitioning] = useState<ListItem | null>(null);
  const [assigning, setAssigning] = useState<ListItem | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const sprintId = sprint === ALL_ACTIVE ? null : Number(sprint);
  const tickets = useQuery({
    queryKey: ["jira-list", query, sprintId, mine, showDone],
    queryFn: () => list({ query, sprintId, mine, showDone }),
  });
  const sprints = useQuery({ queryKey: ["jira-sprints"], queryFn: () => listSprints({}), staleTime: 5 * 60_000 });
  const c = theme.colors;
  // Refetches keep the old list on screen, so show progress on the button itself.
  const refreshing = tickets.isFetching || sprints.isFetching;
  const tone: Record<string, string> = { done: c.statusSuccess, indeterminate: c.statusWarning };

  const rows = useMemo<Row[]>(() => {
    const groups = new Map<string, ListItem[]>();
    for (const item of tickets.data?.items ?? []) {
      const name = item.sprint?.name ?? "No sprint";
      groups.set(name, [...(groups.get(name) ?? []), item]);
    }
    return [...groups].flatMap(([name, items]) => [
      { type: "header" as const, key: `h:${name}`, title: name, count: items.length },
      ...items.map((item) => ({ type: "ticket" as const, key: item.id, item })),
    ]);
  }, [tickets.data]);

  // The default view: active sprints, or the next upcoming one(s) when nothing is active (mirrors the daemon).
  const active = defaultSprints(sprints.data?.sprints ?? []);
  const noneActive = active.length > 0 && active[0].state !== "active";
  // With a single default sprint, "all active" *is* that sprint: show it as such instead of a separate option.
  const soleActive = active.length === 1 ? active[0] : undefined;
  const current =
    sprints.data?.sprints.find((sp) => String(sp.id) === sprint) ?? (sprint === ALL_ACTIVE ? soleActive : undefined);
  const boards = new Map<string, Sprint[]>();
  for (const sp of sprints.data?.sprints ?? []) {
    const board = sp.boardName ?? "Board";
    boards.set(board, [...(boards.get(board) ?? []), sp]);
  }
  const choose = (value: string) => {
    setSprint(value);
    setMenuOpen(false);
  };

  return (
    <View style={styles.screen}>
      {menuOpen ? (
        // Click-away layer under the header (zIndex 10) and its menu, over the rest of the screen.
        <Pressable
          accessibilityLabel="Close sprint menu"
          onPress={() => setMenuOpen(false)}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 5 }}
        />
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, zIndex: 10 }}>
        {/* Phones already show "Jira" in the screen header. */}
        {layout.compact ? null : (
          <View style={{ gap: 2 }}>
            <Text style={[styles.text, { fontSize: 24, fontWeight: "700" }]}>Jira</Text>
            <Text style={[styles.muted, { fontSize: 11 }]}>Sprint workspace</Text>
          </View>
        )}
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose sprint"
            style={styles.selectTrigger}
            onPress={() => setMenuOpen((o) => !o)}
          >
            <Icon name="Zap" size={14} color={c.foregroundMuted} />
            <Text style={[styles.text, { flexShrink: 1 }]} numberOfLines={1}>
              {current ? sprintLabel(current) : noneActive ? "Next upcoming sprints" : "All active sprints"}
            </Text>
            <Icon name={menuOpen ? "ChevronUp" : "ChevronDown"} size={14} color={c.foregroundMuted} />
          </Pressable>
          {menuOpen ? (
            <View style={styles.menu}>
              <ScrollView style={{ maxHeight: 420 }}>
                {soleActive ? null : (
                  <Pressable style={styles.menuItem} onPress={() => choose(ALL_ACTIVE)}>
                    <Text style={sprint === ALL_ACTIVE ? styles.accent : styles.text}>
                      {noneActive ? "Next upcoming sprints" : "All active sprints"}
                      {active.length ? ` (${active.length})` : ""}
                    </Text>
                  </Pressable>
                )}
                {sprints.isPending ? <Spinner color={c.foregroundMuted} /> : null}
                {sprints.error ? <Text style={[styles.error, { padding: 8 }]}>{sprints.error.message}</Text> : null}
                {sprints.data?.sprints.length === 0 ? (
                  <Text style={[styles.muted, { padding: 8 }]}>Choose boards in Settings → Plugins → Jira to list their sprints.</Text>
                ) : null}
                {[...boards].map(([board, items]) => (
                  <View key={board}>
                    <Text style={styles.menuGroup}>{board}</Text>
                    {items.map((sp) => (
                      <Pressable
                        key={sp.id}
                        style={styles.menuItem}
                        onPress={() => choose(sp === soleActive ? ALL_ACTIVE : String(sp.id))}
                      >
                        <Text style={sp === current ? styles.accent : styles.text}>
                          {sprintLabel(sp)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
        <View style={{ flexGrow: 1 }} />
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Show done"
          accessibilityState={{ checked: showDone }}
          onPress={() => setShowDone((v) => !v)}
          style={[styles.chip, showDone && { borderColor: c.accent }]}
        >
          <Icon name="CircleCheck" size={13} color={showDone ? c.accent : c.foregroundMuted} />
          {layout.compact ? null : (
            <Text style={{ color: showDone ? c.accent : c.foregroundMuted, fontSize: 13 }}>Show done</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Only mine"
          accessibilityState={{ checked: mine }}
          onPress={() => setMine((m) => !m)}
          style={[styles.chip, mine && { borderColor: c.accent }]}
        >
          <Icon name="User" size={13} color={mine ? c.accent : c.foregroundMuted} />
          {layout.compact ? null : (
            <Text style={{ color: mine ? c.accent : c.foregroundMuted, fontSize: 13 }}>Only mine</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh"
          onPress={() => {
            void tickets.refetch();
            void sprints.refetch();
            if (expandedKey) void queryClient.invalidateQueries({ queryKey: ["jira-ticket", expandedKey] });
          }}
          disabled={refreshing}
          style={({ pressed }) => ({ padding: 6, borderRadius: 6, backgroundColor: pressed ? c.surface2 : "transparent" })}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={c.foregroundMuted} style={{ width: 16, height: 16 }} />
          ) : (
            <Icon name="RefreshCw" size={16} color={c.foregroundMuted} />
          )}
        </Pressable>
        {onOpenSettings ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Jira settings"
            onPress={onOpenSettings}
            style={({ pressed }) => ({ minWidth: 28, minHeight: 28, alignItems: "center", justifyContent: "center", padding: 6, borderRadius: 6, backgroundColor: pressed ? c.surface2 : "transparent" })}
          >
            <Icon name="Settings" size={16} color={c.foregroundMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.searchBox}>
        <Icon name="Search" size={16} color={c.foregroundMuted} />
        <RNTextInput
          style={styles.bareInput}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => setQuery(input.trim())}
          placeholder="Search this sprint by key or text, Enter to search"
          placeholderTextColor={c.foregroundMuted}
          returnKeyType="search"
          accessibilityLabel="Search Jira"
        />
        {query ? (
          <Pressable
            accessibilityLabel="Clear search"
            onPress={() => {
              setInput("");
              setQuery("");
            }}
          >
            <Icon name="X" size={14} color={c.foregroundMuted} />
          </Pressable>
        ) : null}
      </View>

      {tickets.isPending ? (
        <Spinner color={c.foregroundMuted} />
      ) : tickets.error ? (
        <View style={styles.card}>
          <Text style={styles.error}>{tickets.error.message}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          style={{ opacity: tickets.isFetching ? 0.6 : 1 }}
          contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
          ListEmptyComponent={<Text style={[styles.muted, { textAlign: "center", padding: 32 }]}>No tickets found.</Text>}
          renderItem={({ item: row }) => {
            if (row.type === "header") {
              return (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginTop: 12, marginBottom: 2, paddingHorizontal: 2 }}>
                  <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: c.accent }} />
                  <Text style={[styles.text, { fontSize: 14, fontWeight: "600" }]}>{row.title}</Text>
                  <View style={{ minWidth: 24, alignItems: "center", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: c.surface2 }}>
                    <Text style={[styles.muted, { fontSize: 11, fontWeight: "600" }]}>{row.count}</Text>
                  </View>
                </View>
              );
            }
            const item = row.item;
            const statusColor = tone[item.statusCategory] ?? c.foregroundMuted;
            const expanded = expandedKey === item.key;
            return (
              <View style={[styles.ticketCard, expanded && { borderColor: c.accent }]}>
                <View style={{ flexDirection: layout.compact ? "column" : "row", alignItems: layout.compact ? "stretch" : "center" }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${expanded ? "Hide" : "Show"} details for ${item.key}: ${item.title}`}
                    accessibilityState={{ expanded }}
                    onPress={() => setExpandedKey((current) => (current === item.key ? null : item.key))}
                    style={({ pressed }) => ({
                      flex: 1,
                      minWidth: 0,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 16,
                      paddingLeft: 12,
                      paddingRight: 18,
                      backgroundColor: pressed ? c.surface2 : "transparent",
                    })}
                  >
                    <View style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: c.surface2 }}>
                      <Icon name={expanded ? "ChevronDown" : "ChevronRight"} size={18} color={expanded ? c.accent : c.foregroundMuted} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ flexShrink: 0, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, backgroundColor: c.surface2 }}>
                        <Text style={[styles.muted, { fontSize: 11, fontWeight: "700", fontFamily: "monospace" }]}>{item.key}</Text>
                      </View>
                      <Text style={[styles.text, { flex: 1, minWidth: 0, fontSize: 15, fontWeight: "500", lineHeight: 21 }]} numberOfLines={2}>
                        {item.title}
                      </Text>
                    </View>
                  </Pressable>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: layout.compact ? "flex-start" : "flex-end",
                      flexWrap: "wrap",
                      gap: 8,
                      maxWidth: layout.compact ? undefined : 390,
                      paddingLeft: layout.compact ? 14 : 0,
                      paddingRight: 14,
                      paddingBottom: layout.compact ? 12 : 0,
                    }}
                  >
                    {item.status ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Change status of ${item.key}`}
                        onPress={() => setTransitioning(item)}
                        style={({ pressed }) => ({
                          minHeight: 30,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          backgroundColor: c.surface2,
                          borderRadius: 999,
                          paddingHorizontal: 9,
                          paddingVertical: 3,
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
                        <Text style={{ color: statusColor, fontSize: 11, fontWeight: "600" }}>{item.status}</Text>
                        <Icon name="ChevronDown" size={11} color={statusColor} />
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Change assignee of ${item.key}`}
                      onPress={() => setAssigning(item)}
                      style={({ pressed }) => ({ minHeight: 32, maxWidth: 160, flexDirection: "row", alignItems: "center", gap: 5, opacity: pressed ? 0.7 : 1 })}
                    >
                      <Icon name="UserRound" size={13} color={c.foregroundMuted} />
                      <Text style={[styles.muted, { fontSize: 12, flexShrink: 1 }]} numberOfLines={1}>{item.assignee ?? "Unassigned"}</Text>
                    </Pressable>
                    <StartButton
                      item={item}
                      styles={styles}
                      onStart={() =>
                        setSelected({ id: item.id, identifier: item.key, title: item.title, url: item.url, text: "", resourceType: "issue" })
                      }
                    />
                  </View>
                </View>
                {expanded ? <TicketDetails item={item} styles={styles} compact={layout.compact} /> : null}
              </View>
            );
          }}
        />
      )}
      {assigning ? (
        <AssignModal
          key={assigning.id}
          item={assigning}
          styles={styles}
          onClose={() => setAssigning(null)}
          onChanged={() => {
            void tickets.refetch();
            void queryClient.invalidateQueries({ queryKey: ["jira-ticket", assigning.key] });
          }}
        />
      ) : null}
      {transitioning ? (
        <StatusModal
          key={transitioning.id}
          item={transitioning}
          styles={styles}
          tone={tone}
          onClose={() => setTransitioning(null)}
          onChanged={() => {
            void tickets.refetch();
            void queryClient.invalidateQueries({ queryKey: ["jira-ticket", transitioning.key] });
          }}
        />
      ) : null}
      {selected ? (
        <StartModal
          key={selected.id}
          ticket={selected}
          onClose={() => setSelected(null)}
          styles={styles}
          navigation={navigation}
          compact={layout.compact}
        />
      ) : null}
    </View>
  );
}
