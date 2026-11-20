import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, Text, View, useWindowDimensions } from "react-native";
import { getPaseoClient, useHosts, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon, ScrollView } from "@getpaseo/plugin/client/ui";
import { defaultDirectoryHost, directoryProjects } from "./start-projects";
import { desktopServerId, pickDesktopDirectory } from "./web";

const CHOOSE_FOLDER = "choose-folder";

export function DevspaceDirectoryPicker({ theme, launchHostId, selectedPath, onChoose, onCancel }: {
  theme: PluginScreenProps["theme"];
  launchHostId: string;
  selectedPath?: string;
  onChoose(path: string): void;
  onCancel(): void;
}) {
  const hosts = useHosts();
  const { height } = useWindowDimensions();
  const [hovered, setHovered] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | null>(() => defaultDirectoryHost(hosts, launchHostId));
  const [filter, setFilter] = useState("");
  useEffect(() => {
    if (!hostId) setHostId(defaultDirectoryHost(hosts, launchHostId));
  }, [hosts, hostId, launchHostId]);
  const host = hosts.find((candidate) => candidate.serverId === hostId);
  const online = host?.status === "online";
  const projects = useQuery({
    queryKey: ["devspace-directory-projects", hostId],
    queryFn: async () => directoryProjects((await getPaseoClient(hostId!).projects.list()).projects),
    enabled: !!hostId && online,
  });
  // The system dialog browses the computer running this app, so offer it only when that computer is selected.
  const localServerId = useQuery({ queryKey: ["paseo-desktop-server-id"], queryFn: desktopServerId, staleTime: Infinity });
  const canPickFolder = online && !!hostId && hostId === localServerId.data;
  const pickFolder = useMutation({
    mutationFn: () => pickDesktopDirectory(selectedPath || undefined),
    onSuccess: (path) => { if (path) onChoose(path); },
  });
  const needle = filter.trim().toLowerCase();
  const visible = (projects.data ?? []).filter((project) => `${project.name} ${project.path}`.toLowerCase().includes(needle));
  const c = theme.colors;
  const text = { color: c.foreground, fontSize: 13 };
  const muted = { color: c.foregroundMuted, fontSize: 12, lineHeight: 17 };
  const hover = (key: string) => ({ onHoverIn: () => setHovered(key), onHoverOut: () => setHovered((current) => (current === key ? null : current)) });
  const message = (body: string) => <Text style={[muted, { paddingVertical: 16, paddingHorizontal: 10 }]}>{body}</Text>;

  return (
    <View style={{ gap: 10, maxHeight: Math.min(520, height - 48), padding: 12, borderRadius: 12, borderWidth: 1,
      borderColor: c.border, backgroundColor: c.surface1,
      shadowColor: "#000000", shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 2 }}>
        <Text style={{ color: c.foreground, fontSize: 14, fontWeight: "600" }}>DevSpace project directory</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close directory menu" onPress={onCancel} {...hover("close")}
          style={{ padding: 6, borderRadius: 6, backgroundColor: hovered === "close" ? c.surface2 : "transparent" }}>
          <Icon name="X" size={14} color={c.foregroundMuted} />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2, padding: 3, borderRadius: 9, backgroundColor: c.surface0 }}>
        {hosts.map((candidate) => {
          const selected = candidate.serverId === hostId;
          const offline = candidate.status !== "online";
          return (
            <Pressable key={candidate.serverId} accessibilityRole="button"
              accessibilityLabel={`Browse projects on ${candidate.label}`}
              accessibilityState={{ selected, disabled: offline }} disabled={offline}
              onPress={() => { setHostId(candidate.serverId); setFilter(""); }} {...hover(candidate.serverId)}
              style={{ flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, opacity: offline ? 0.5 : 1,
                backgroundColor: selected ? c.surface2 : hovered === candidate.serverId ? c.surface1 : "transparent" }}>
              <Icon name="Monitor" size={14} color={selected ? c.foreground : c.foregroundMuted} />
              <Text numberOfLines={1} style={{ color: selected ? c.foreground : c.foregroundMuted, fontSize: 13, fontWeight: selected ? "500" : "400" }}>
                {candidate.label}
              </Text>
              {offline ? <Text style={muted}>{candidate.status}</Text> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36, paddingHorizontal: 10,
          borderRadius: 8, borderWidth: 1, borderColor: c.border }}>
          <Icon name="Search" size={14} color={c.foregroundMuted} />
          {/* outlineStyle removes the browser focus ring on web; the surrounding box is the visual field. */}
          <TextInput value={filter} onChangeText={setFilter} placeholder="Filter projects" placeholderTextColor={c.foregroundMuted}
            autoFocus accessibilityLabel="Filter DevSpace project directories"
            style={{ flex: 1, color: c.foreground, fontSize: 13, paddingVertical: 7, outlineStyle: "none" as never }} />
        </View>
        {canPickFolder ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Choose any folder on this computer"
            accessibilityState={{ disabled: pickFolder.isPending }} disabled={pickFolder.isPending}
            onPress={() => pickFolder.mutate()} {...hover(CHOOSE_FOLDER)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, borderRadius: 8,
              borderWidth: 1, borderColor: c.border, backgroundColor: pressed || hovered === CHOOSE_FOLDER ? c.surface2 : "transparent" })}>
            {pickFolder.isPending ? <ActivityIndicator size="small" color={c.foregroundMuted} />
              : <Icon name="FolderOpen" size={14} color={c.foreground} />}
            <Text style={text}>Choose folder…</Text>
          </Pressable>
        ) : null}
      </View>
      {pickFolder.error ? <Text style={{ color: c.statusDanger, fontSize: 12 }}>{pickFolder.error.message}</Text> : null}

      <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: 2 }} keyboardShouldPersistTaps="handled">
        {!hostId ? message("Select a computer to see its projects.")
          : !online ? message(`${host?.label ?? "This computer"} is offline. Reconnect it to browse its projects.`)
          : projects.isPending ? <ActivityIndicator color={c.foregroundMuted} style={{ padding: 16 }} />
          : projects.error ? <View style={{ gap: 8, paddingVertical: 16, paddingHorizontal: 10 }}>
            <Text style={{ color: c.statusDanger, fontSize: 12 }}>{projects.error.message}</Text>
            <Pressable accessibilityRole="button" onPress={() => void projects.refetch()}>
              <Text style={{ color: c.accent, fontSize: 13 }}>Retry</Text>
            </Pressable>
          </View>
          : visible.length === 0 ? message(projects.data?.length ? `No projects match “${filter.trim()}”.`
            : canPickFolder ? "No Paseo projects on this computer yet. Choose a folder instead."
            : `No Paseo projects on ${host?.label ?? "this computer"}.`)
          : visible.map((project) => {
            const selected = project.path === selectedPath;
            return (
              <Pressable key={project.path} accessibilityRole="button" accessibilityLabel={`Select directory ${project.path}`}
                accessibilityState={{ selected }} onPress={() => onChoose(project.path)} {...hover(project.path)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 10,
                  borderRadius: 8, backgroundColor: selected || pressed || hovered === project.path ? c.surface2 : "transparent" })}>
                <Icon name="Folder" size={16} color={selected ? c.foreground : c.foregroundMuted} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text numberOfLines={1} style={[text, { fontWeight: "500" }]}>{project.name}</Text>
                  <Text numberOfLines={1} ellipsizeMode="middle" style={muted}>{project.path}</Text>
                </View>
                {selected ? <Icon name="Check" size={14} color={c.accent} /> : null}
              </Pressable>
            );
          })}
      </ScrollView>

      {online && !canPickFolder ? (
        <Text style={[muted, { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, paddingHorizontal: 2 }]}>
          Not listed? Type the full path in the Start form.
        </Text>
      ) : null}
    </View>
  );
}
