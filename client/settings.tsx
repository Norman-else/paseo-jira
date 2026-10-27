import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRpc, useSettings, type PluginSurfaceProps, type SettingsState } from "@getpaseo/plugin/client";
import {
  Icon,
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { jiraSettings, listBoardsRpc, testConnectionRpc, updatePluginRpc } from "../shared/jira";

type Ready = Extract<SettingsState<typeof jiraSettings.schema>, { status: "ready" }>;

const FIELDS: { key: "baseUrl" | "email" | "apiToken" | "defaultJql"; label: string; hint?: string; secure?: boolean }[] = [
  { key: "baseUrl", label: "Jira URL", hint: "https://your-site.atlassian.net" },
  { key: "email", label: "Email" },
  { key: "apiToken", label: "API token", hint: "id.atlassian.com → Security → API tokens", secure: true },
  { key: "defaultJql", label: "Default JQL", hint: "Used when the search box is empty" },
];

function Editor({ settings, theme }: { settings: Ready; theme: PluginSurfaceProps["theme"] }) {
  // ponytail: saves against the latest revision (last write wins); single-user settings don't need draft conflict detection.
  const [draft, setDraft] = useState(settings.values);
  const testConnection = useRpc(testConnectionRpc);
  const test = useMutation({ mutationFn: () => testConnection({}) });
  const save = async () => {
    if (await settings.save({ ...draft, boardIds: settings.values.boardIds }, settings.revision)) test.reset();
  };
  const text = { color: theme.colors.foreground };

  return (
    <SettingsSection title="Jira connection">
      <SettingsCard>
        {FIELDS.map((field) => (
          <SettingsInput
            key={field.key}
            label={field.label}
            hint={field.hint}
            secureTextEntry={field.secure}
            initialValue={draft[field.key]}
            disabled={settings.saving}
            onChangeText={(value) =>
              setDraft((d) => ({ ...d, [field.key]: value }))
            }
          />
        ))}
        <SettingsAction
          label="Save changes"
          actionLabel="Save"
          disabled={settings.saving}
          error={settings.saveError}
          onPress={save}
        />
        <SettingsAction
          label="Test saved connection"
          actionLabel={test.isPending ? "Testing…" : "Test"}
          disabled={test.isPending}
          error={test.error?.message}
          onPress={() => test.mutate()}
        />
      </SettingsCard>
      {test.data ? <Text style={text}>Connected as {test.data.displayName}</Text> : null}
    </SettingsSection>
  );
}

function BoardPicker({ settings, theme }: { settings: Ready; theme: PluginSurfaceProps["theme"] }) {
  const listBoards = useRpc(listBoardsRpc);
  const boards = useQuery({ queryKey: ["jira-boards"], queryFn: () => listBoards({}) });
  const [filter, setFilter] = useState("");
  const chosen = new Set(settings.values.boardIds);
  const needle = filter.trim().toLowerCase();
  const visible = (boards.data?.boards ?? [])
    .filter((b) => !needle || `${b.name} ${b.project ?? ""}`.toLowerCase().includes(needle))
    // Selected boards first so they're easy to find and untick.
    .sort((a, b) => Number(chosen.has(b.id)) - Number(chosen.has(a.id)));
  const toggle = (id: number, on: boolean) => {
    const boardIds = on ? [...settings.values.boardIds, id] : settings.values.boardIds.filter((b) => b !== id);
    void settings.save({ ...settings.values, boardIds }, settings.revision);
  };
  const muted = { color: theme.colors.foregroundMuted };

  return (
    <SettingsSection title="Sprint boards">
      <SettingsCard>
        <SettingsInput
          label="Filter boards"
          hint={`${chosen.size} selected. The Jira page's sprint switcher lists active and upcoming sprints of these boards.`}
          placeholder="Board or project key"
          onChangeText={setFilter}
        />
        {boards.isPending ? <ActivityIndicator color={muted.color} style={{ padding: 12 }} /> : null}
        {boards.error ? <Text style={{ color: theme.colors.statusDanger, padding: 12 }}>{boards.error.message}</Text> : null}
        {visible.slice(0, 50).map((b) => (
          <SettingsSwitch
            key={b.id}
            label={b.name}
            hint={b.project ?? undefined}
            value={chosen.has(b.id)}
            disabled={settings.saving}
            onValueChange={(on) => toggle(b.id, on)}
          />
        ))}
        {visible.length > 50 ? <Text style={[muted, { padding: 12 }]}>Showing 50 of {visible.length}. Filter to narrow down.</Text> : null}
      </SettingsCard>
    </SettingsSection>
  );
}

function PluginUpdate({ theme }: { theme: PluginSurfaceProps["theme"] }) {
  const updatePlugin = useRpc(updatePluginRpc);
  const update = useMutation({ mutationFn: () => updatePlugin({}) });
  const isSuccess = update.data?.status === "updated" || update.data?.status === "completed";

  return (
    <SettingsSection title="Plugin updates">
      <SettingsCard>
        <SettingsAction
          label="Check for updates"
          hint="Check for a new paseo-jira version and install it when available."
          actionLabel={update.isPending ? "Updating…" : "Check updates"}
          disabled={update.isPending}
          error={update.error?.message}
          onPress={() => update.mutate()}
        />
        {update.data ? (
          <View
            accessibilityLiveRegion="polite"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginHorizontal: 12,
              marginBottom: 12,
              paddingHorizontal: 10,
              paddingVertical: 9,
              borderRadius: 8,
              backgroundColor: theme.colors.surface2,
            }}
          >
            <Icon
              name={isSuccess ? "CircleCheck" : "Info"}
              size={15}
              color={isSuccess ? theme.colors.statusSuccess : theme.colors.foregroundMuted}
            />
            <Text style={{ flex: 1, color: theme.colors.foreground, fontSize: 13, lineHeight: 18 }}>
              {update.data.message}
            </Text>
          </View>
        ) : null}
      </SettingsCard>
    </SettingsSection>
  );
}

export function JiraSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(jiraSettings);
  if (settings.status === "loading") return <ActivityIndicator style={{ padding: 12 }} />;
  if (settings.status !== "ready") {
    return (
      <>
        <PluginUpdate theme={theme} />
        <SettingsSection title="Jira connection">
          <Text style={{ color: theme.colors.foreground }}>{settings.error}</Text>
          <SettingsAction label="Restore default settings" actionLabel="Reset" onPress={settings.reset} />
        </SettingsSection>
      </>
    );
  }
  return (
    <>
      <PluginUpdate theme={theme} />
      <Editor settings={settings} theme={theme} />
      <BoardPicker settings={settings} theme={theme} />
    </>
  );
}
