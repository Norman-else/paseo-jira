import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View, useWindowDimensions } from "react-native";
import { getPaseoClient, useHosts, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon, ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import { defaultDirectoryHost, directoryProjects } from "./start-projects";

export function DevspaceDirectoryPicker({ theme, launchHostId, selectedPath, onChoose, onCancel }: {
  theme: PluginScreenProps["theme"];
  launchHostId: string;
  selectedPath?: string;
  onChoose(path: string): void;
  onCancel(): void;
}) {
  const hosts = useHosts();
  const { height } = useWindowDimensions();
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
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
  const needle = filter.trim().toLowerCase();
  const visible = (projects.data ?? []).filter((project) => `${project.name} ${project.path}`.toLowerCase().includes(needle));
  const text = { color: theme.colors.foreground };
  const muted = { color: theme.colors.foregroundMuted, fontSize: 12 };
  const row = { padding: 12, borderRadius: 8, gap: 4 };

  return (
    <View style={{ gap: 12, height: Math.min(480, height - 48), padding: 12, borderRadius: 8, borderWidth: 1,
      borderColor: theme.colors.border, backgroundColor: theme.colors.surface1,
      shadowColor: "#000000", shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text style={[text, { fontSize: 15, fontWeight: "600" }]}>DevSpace project directory</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close directory menu" onPress={onCancel} style={{ padding: 6 }}>
          <Icon name="X" size={16} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
      <Text style={muted}>Choose the computer hosting your DevSpace project, then a registered project directory. Other directories can be entered in the Start form.</Text>
      <View style={{ gap: 4 }}>
        {hosts.map((candidate) => (
          <Pressable key={candidate.serverId} accessibilityRole="button"
            accessibilityLabel={`Browse projects on ${candidate.label}`}
            accessibilityState={{ selected: candidate.serverId === hostId, disabled: candidate.status !== "online" }}
            disabled={candidate.status !== "online"}
            onPress={() => { setHostId(candidate.serverId); setFilter(""); }}
            style={[row, { flexDirection: "row", alignItems: "center", opacity: candidate.status === "online" ? 1 : 0.5,
              backgroundColor: candidate.serverId === hostId ? theme.colors.surface2 : theme.colors.surface1 }]}>
            <Icon name="Monitor" size={16} color={text.color} />
            <Text style={[text, { flex: 1 }]}>{candidate.label}</Text>
            {candidate.status !== "online" ? <Text style={muted}>{candidate.status}</Text> : null}
            {candidate.serverId === hostId ? <Icon name="Check" size={16} color={theme.colors.accent} /> : null}
          </Pressable>
        ))}
      </View>
      <TextInput value={filter} onChangeText={setFilter} placeholder="Search project name or path"
        autoFocus
        accessibilityLabel="Search DevSpace project directories"
        style={{ color: text.color, padding: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8 }} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 4 }} keyboardShouldPersistTaps="handled">
        {!hostId ? <Text style={[muted, { padding: 12 }]}>Select a computer to see its project directories.</Text>
          : !online ? <Text style={[muted, { padding: 12 }]}>This computer is offline. Reconnect it to browse its projects.</Text>
          : projects.isPending ? <ActivityIndicator color={theme.colors.foregroundMuted} style={{ padding: 16 }} />
          : projects.error ? <View style={{ gap: 8, padding: 12 }}>
            <Text style={{ color: theme.colors.statusDanger }}>{projects.error.message}</Text>
            <Pressable accessibilityRole="button" onPress={() => void projects.refetch()}>
              <Text style={{ color: theme.colors.accent }}>Retry</Text>
            </Pressable>
          </View>
          : visible.length === 0 ? <Text style={[muted, { padding: 12 }]}>
            {projects.data?.length ? "No matching project directories." : "No registered projects on this computer. Add a project in Paseo, or enter its path in the Start form."}
          </Text>
          : visible.map((project) => (
            <Pressable key={project.path} accessibilityRole="button"
              accessibilityLabel={`Select directory ${project.path}`} onPress={() => onChoose(project.path)}
              accessibilityState={{ selected: project.path === selectedPath }}
              onHoverIn={() => setHoveredPath(project.path)} onHoverOut={() => setHoveredPath(null)}
              style={({ pressed }) => [row, { backgroundColor: pressed || hoveredPath === project.path || project.path === selectedPath ? theme.colors.surface2 : theme.colors.surface1 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[text, { fontWeight: "500", flex: 1 }]}>{project.name}</Text>
                {project.path === selectedPath ? <Icon name="Check" size={16} color={theme.colors.accent} /> : null}
              </View>
              <Text style={muted}>{project.path}</Text>
            </Pressable>
          ))}
      </ScrollView>
    </View>
  );
}
