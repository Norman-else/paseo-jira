import type { RpcOutput } from "@getpaseo/plugin";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
  openExternalUrl,
  usePaseo,
  useRpc,
  type PluginScreenProps,
} from "@getpaseo/plugin/client";
import {
  FlatList,
  Icon,
  SettingsRow,
  ScrollView,
  Modal,
  SettingsSelect,
  SettingsSwitch,
  TextInput,
  useToast,
} from "@getpaseo/plugin/client/ui";
import {
  defaultPrompt,
  listSprintsRpc,
  listTicketsRpc,
  remoteBranchesRpc,
  searchTicketsRpc,
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
      screen: { flex: 1, padding: compact ? 12 : 24, gap: 16, width: "100%" as const, maxWidth: 960, alignSelf: "center" as const, backgroundColor: theme.colors.surface0 },
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
        gap: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
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

function PickerTrigger({ picking, onOpen, styles }: { picking: Picking; onOpen(p: Picking): void; styles: Styles }) {
  const current = picking.options.find((o) => o.value === picking.value);
  return (
    <SettingsRow label={picking.label}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Choose ${picking.label}`}
        style={styles.selectTrigger}
        onPress={() => onOpen(picking)}
      >
        <Text style={styles.text} numberOfLines={1}>
          {current ? `${current.group} · ${current.label}` : `Choose ${picking.label.toLowerCase()}`}
        </Text>
        <Icon name="ChevronDown" size={14} color={styles.muted.color} />
      </Pressable>
    </SettingsRow>
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
    <View style={{ gap: 12 }}>
      <Pressable accessibilityRole="button" onPress={onDone} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name="ChevronLeft" size={16} color={styles.text.color} />
        <Text style={styles.text}>{picking.label}</Text>
      </Pressable>
      <TextInput
        style={styles.input}
        value={filter}
        onChangeText={setFilter}
        placeholder="Search"
        autoFocus
        accessibilityLabel={`Search ${picking.label}`}
      />
      <ScrollView style={{ maxHeight: 420 }}>
        {[...groups].map(([group, items]) => (
          <View key={group}>
            <Text style={[styles.muted, { marginTop: 8, fontSize: 12, textTransform: "uppercase" }]}>{group}</Text>
            {items.map((o) => (
              <Pressable
                key={o.value}
                accessibilityRole="button"
                style={{ paddingVertical: 8, paddingLeft: 8 }}
                onPress={() => {
                  picking.onChange(o.value);
                  onDone();
                }}
              >
                <Text style={o.value === picking.value ? styles.accent : styles.text}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
        ))}
        {groups.size === 0 ? <Text style={styles.muted}>No matches.</Text> : null}
      </ScrollView>
    </View>
  );
}

function StartModal({
  ticket,
  onClose,
  styles,
  navigation,
}: {
  ticket: Ticket;
  onClose(): void;
  styles: Styles;
  navigation: PluginScreenProps["navigation"];
}) {
  const paseo = usePaseo();
  const listBranches = useRpc(remoteBranchesRpc);
  const toast = useToast();
  const [prompt, setPrompt] = useState(() => defaultPrompt(ticket.identifier, ticket.url));
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
      const project = workspaces.data?.find((p) => p.id === workspaceId);
      if (!project) throw new Error("Choose a project");
      const cwd = project.root;
      if (!model) throw new Error("Choose a model");
      const config = { provider: model };
      if (!useWorktree) {
        // Opens (or reuses) the workspace rooted at the repo directory itself.
        const workspace = await paseo.workspaces.open(cwd);
        const agent = await workspace.agents.create({ config, prompt, title: ticket.identifier });
        return { agentId: agent.id, workspaceId: workspace.id };
      }
      if (!baseBranch) throw new Error("Choose a base branch");
      const refName = baseBranch;
      const created = await paseo.workspaces.create({
        source: { kind: "worktree", cwd, action: "branch-off", refName, branchName: ticket.identifier },
        title: `${ticket.identifier} ${ticket.title}`,
        agent: { cwd, config, prompt, title: ticket.identifier },
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

  const options = (workspaces.data ?? []).map((p) => ({ label: p.name, value: p.id }));

  return (
    <Modal title={`Start ${ticket.identifier}`} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content>
        {picking ? (
          <PickerView picking={picking} onDone={() => setPicking(null)} styles={styles} />
        ) : (
        <>
        <Text style={styles.muted}>{ticket.title}</Text>
        <TextInput
          style={[styles.input, { minHeight: 96, textAlignVertical: "top" }]}
          multiline
          value={prompt}
          onChangeText={setPrompt}
          accessibilityLabel="Prompt"
        />
        {workspaces.isPending ? (
          <Spinner color={styles.muted.color} />
        ) : workspaces.error ? (
          <Text style={styles.error}>{workspaces.error.message}</Text>
        ) : (
          <SettingsSelect label="Project" value={workspaceId} options={options} onValueChange={setWorkspaceId} />
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
        <SettingsSwitch
          label="Use worktree"
          hint={`New worktree on branch ${ticket.identifier}, based on the remote branch below (fetched first)`}
          value={useWorktree}
          onValueChange={setUseWorktree}
        />
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
          style={[styles.button, { alignSelf: "flex-end" as const, opacity: start.isPending ? 0.6 : 1 }]}
          disabled={start.isPending || !model || (useWorktree && !baseBranch) || !workspaceId || !prompt.trim()}
          onPress={() => start.mutate()}
        >
          <Text style={styles.buttonText}>{start.isPending ? "Starting…" : "Start"}</Text>
        </Pressable>
        </>
        )}
      </Modal.Content>
    </Modal>
  );
}

type ListItem = RpcOutput<typeof listTicketsRpc>["items"][number];
type Row = { type: "header"; key: string; title: string; count: number } | { type: "ticket"; key: string; item: ListItem };

const ALL_ACTIVE = "active";

function sprintLabel(sp: Sprint) {
  return sp.state === "active" ? `${sp.name} · active` : sp.state === "future" ? `${sp.name} · upcoming` : sp.name;
}

export function JiraScreen({ theme, layout, navigation }: PluginScreenProps) {
  const styles = useStyles(theme, layout.compact);
  const list = useRpc(listTicketsRpc);
  const listSprints = useRpc(listSprintsRpc);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [sprint, setSprint] = useState(ALL_ACTIVE);
  const [mine, setMine] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const sprintId = sprint === ALL_ACTIVE ? null : Number(sprint);
  const tickets = useQuery({
    queryKey: ["jira-list", query, sprintId, mine],
    queryFn: () => list({ query, sprintId, mine }),
  });
  const sprints = useQuery({ queryKey: ["jira-sprints"], queryFn: () => listSprints({}), staleTime: 5 * 60_000 });
  const c = theme.colors;
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

  const current = sprints.data?.sprints.find((sp) => String(sp.id) === sprint);
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, zIndex: 10 }}>
        <Text style={[styles.text, { fontSize: 20, fontWeight: "600" }]}>Jira</Text>
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose sprint"
            style={styles.selectTrigger}
            onPress={() => setMenuOpen((o) => !o)}
          >
            <Icon name="Zap" size={14} color={c.foregroundMuted} />
            <Text style={styles.text} numberOfLines={1}>
              {current ? sprintLabel(current) : "All active sprints"}
            </Text>
            <Icon name={menuOpen ? "ChevronUp" : "ChevronDown"} size={14} color={c.foregroundMuted} />
          </Pressable>
          {menuOpen ? (
            <View style={styles.menu}>
              <ScrollView style={{ maxHeight: 420 }}>
                <Pressable style={styles.menuItem} onPress={() => choose(ALL_ACTIVE)}>
                  <Text style={sprint === ALL_ACTIVE ? styles.accent : styles.text}>All active sprints</Text>
                </Pressable>
                {sprints.isPending ? <Spinner color={c.foregroundMuted} /> : null}
                {sprints.error ? <Text style={[styles.error, { padding: 8 }]}>{sprints.error.message}</Text> : null}
                {sprints.data?.sprints.length === 0 ? (
                  <Text style={[styles.muted, { padding: 8 }]}>Choose boards in Settings → Plugins → Jira to list their sprints.</Text>
                ) : null}
                {[...boards].map(([board, items]) => (
                  <View key={board}>
                    <Text style={styles.menuGroup}>{board}</Text>
                    {items.map((sp) => (
                      <Pressable key={sp.id} style={styles.menuItem} onPress={() => choose(String(sp.id))}>
                        <Text style={String(sp.id) === sprint ? styles.accent : styles.text}>
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
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: mine }}
          onPress={() => setMine((m) => !m)}
          style={[styles.chip, mine && { borderColor: c.accent }]}
        >
          <Icon name="User" size={13} color={mine ? c.accent : c.foregroundMuted} />
          <Text style={{ color: mine ? c.accent : c.foregroundMuted, fontSize: 13 }}>Only mine</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh"
          onPress={() => {
            void tickets.refetch();
            void sprints.refetch();
          }}
          style={{ padding: 6, borderRadius: 6 }}
        >
          <Icon name="RefreshCw" size={16} color={c.foregroundMuted} />
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <Icon name="Search" size={16} color={c.foregroundMuted} />
        <TextInput
          style={{ flex: 1, color: c.foreground, paddingVertical: 8 }}
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
          contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
          ListEmptyComponent={<Text style={[styles.muted, { textAlign: "center", padding: 32 }]}>No tickets found.</Text>}
          renderItem={({ item: row }) => {
            if (row.type === "header") {
              return (
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 8 }}>
                  <Text style={[styles.text, { fontSize: 13, fontWeight: "600" }]}>{row.title}</Text>
                  <Text style={[styles.muted, { fontSize: 12 }]}>{row.count}</Text>
                </View>
              );
            }
            const item = row.item;
            const statusColor = tone[item.statusCategory] ?? c.foregroundMuted;
            return (
              <View style={styles.card}>
                <Pressable
                  style={{ flex: 1, gap: 6 }}
                  onPress={() => void openExternalUrl(item.url)}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${item.key} in Jira`}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={[styles.muted, { fontSize: 12, fontWeight: "600", fontFamily: "monospace" }]}>{item.key}</Text>
                    {item.status ? (
                      <View style={{ backgroundColor: c.surface2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ color: statusColor, fontSize: 11, fontWeight: "600" }}>{item.status}</Text>
                      </View>
                    ) : null}
                    {item.assignee ? <Text style={[styles.muted, { fontSize: 12 }]}>· {item.assignee}</Text> : null}
                  </View>
                  <Text style={[styles.text, { fontSize: 14 }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Start ${item.key}`}
                  style={styles.startButton}
                  onPress={() => setSelected({ id: item.id, identifier: item.key, title: item.title, url: item.url, text: "", resourceType: "issue" })}
                >
                  <Icon name="Play" size={12} color={c.accent} />
                  <Text style={{ color: c.accent, fontWeight: "600", fontSize: 13 }}>Start</Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}
      {selected ? (
        <StartModal
          key={selected.id}
          ticket={selected}
          onClose={() => setSelected(null)}
          styles={styles}
          navigation={navigation}
        />
      ) : null}
    </View>
  );
}
