import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Modal, useToast } from "@getpaseo/plugin/client/ui";
import { completeSprintRpc, setStoryPointsRpc, startSprintRpc, storyPointsRpc, type Sprint } from "../shared/jira";
import { formatSprintDate, parseSprintDate, parseStoryPoints } from "../shared/planning";

type Theme = PluginScreenProps["theme"];
type CommonProps = { theme: Theme; onClose(): void; onChanged(): Promise<void> };

function Action({ label, theme, onPress, disabled, primary }: {
  label: string; theme: Theme; onPress(): void; disabled?: boolean; primary?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
        borderWidth: 1, borderColor: primary ? theme.colors.accent : theme.colors.border,
        backgroundColor: pressed ? theme.colors.surface2 : "transparent", opacity: disabled ? 0.5 : 1 })}>
      <Text style={{ color: primary ? theme.colors.accent : theme.colors.foreground, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export function StoryPointsModal({ item, theme, onClose, onChanged }: CommonProps & { item: { key: string; title: string } }) {
  const getPoints = useRpc(storyPointsRpc);
  const setPoints = useRpc(setStoryPointsRpc);
  const toast = useToast();
  const c = theme.colors;
  const fields = useQuery({ queryKey: ["jira-story-points", item.key], queryFn: () => getPoints({ key: item.key }), staleTime: 0 });
  const [fieldId, setFieldId] = useState("");
  const [value, setValue] = useState("");
  useEffect(() => {
    if (!fields.data) return;
    // A project may expose both company-managed and team-managed point fields.
    const field = fields.data.fields.length === 1 ? fields.data.fields[0] : undefined;
    setFieldId(field?.id ?? "");
    setValue(field?.value?.toString() ?? "");
  }, [fields.data]);
  let validation = "";
  try { parseStoryPoints(value); } catch (error) { validation = (error as Error).message; }
  const save = useMutation({
    mutationFn: () => setPoints({ key: item.key, fieldId, value: parseStoryPoints(value) }),
    onSuccess: async () => {
      toast.show(`${item.key} Story Points updated`, { variant: "success" });
      await onChanged();
      onClose();
    },
  });
  const close = () => { if (!save.isPending) onClose(); };
  return (
    <Modal title={`Story Points · ${item.key}`} open onOpenChange={(open) => !open && close()}>
      <Modal.Content>
        <Text style={{ color: c.foreground, fontSize: 15 }}>{item.title}</Text>
        {fields.isPending ? <ActivityIndicator color={c.foregroundMuted} /> : fields.error ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: c.statusDanger }}>{fields.error.message}</Text>
            <Action label="Retry" theme={theme} disabled={fields.isFetching} onPress={() => { void fields.refetch(); }} />
          </View>
        ) : !fields.data.fields.length ? (
          <Text style={{ color: c.foregroundMuted }}>Story Points is not editable for this ticket. Check its field configuration and your Jira permissions.</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {fields.data.fields.length > 1 ? (
              <View style={{ gap: 6 }}>
                <Text style={{ color: c.foregroundMuted }}>Choose the estimate field to edit</Text>
                {fields.data.fields.map((field) => (
                  <Pressable key={field.id} accessibilityRole="radio" accessibilityState={{ checked: field.id === fieldId }}
                    disabled={save.isPending} onPress={() => { setFieldId(field.id); setValue(field.value?.toString() ?? ""); }}
                    style={{ padding: 10, borderWidth: 1, borderRadius: 6, borderColor: field.id === fieldId ? c.accent : c.border }}>
                    <Text style={{ color: c.foreground }}>{field.name} · {field.value ?? "Not estimated"}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text style={{ color: c.foregroundMuted }}>Story Points</Text>
            <TextInput accessibilityLabel="Story Points" value={value} onChangeText={setValue} keyboardType="decimal-pad"
              editable={!!fieldId && !save.isPending} placeholder="Not estimated" placeholderTextColor={c.foregroundMuted}
              style={{ color: c.foreground, borderWidth: 1, borderColor: c.border, borderRadius: 6, padding: 10, minHeight: 42 }} />
            <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>Leave blank to clear the estimate. Zero is a valid estimate.</Text>
            {validation ? <Text style={{ color: c.statusDanger }}>{validation}</Text> : null}
          </View>
        )}
        {save.error ? <Text style={{ color: c.statusDanger }}>{save.error.message}</Text> : null}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <Action label="Cancel" theme={theme} disabled={save.isPending} onPress={close} />
          <Action label={save.isPending ? "Saving…" : "Save"} theme={theme} primary
            disabled={fields.isPending || fields.isError || !fieldId || !!validation || save.isPending} onPress={() => save.mutate()} />
        </View>
      </Modal.Content>
    </Modal>
  );
}

export function SprintActionModal({ sprint, theme, onClose, onChanged }: CommonProps & { sprint: Sprint }) {
  const start = useRpc(startSprintRpc);
  const complete = useRpc(completeSprintRpc);
  const toast = useToast();
  const c = theme.colors;
  const starting = sprint.state === "future";
  const [startDate, setStartDate] = useState(() => formatSprintDate(sprint.startDate ? new Date(sprint.startDate) : new Date()));
  const [endDate, setEndDate] = useState(() => {
    if (sprint.endDate) return formatSprintDate(new Date(sprint.endDate));
    const end = sprint.startDate ? new Date(sprint.startDate) : new Date();
    end.setDate(end.getDate() + 14);
    return formatSprintDate(end);
  });
  let validation = "";
  if (starting) {
    try {
      if (Date.parse(parseSprintDate(endDate)) <= Date.parse(parseSprintDate(startDate))) validation = "End date must be after start date.";
    } catch (error) { validation = (error as Error).message; }
  }
  const change = useMutation({
    mutationFn: () => starting
      ? start({ sprintId: sprint.id, startDate: parseSprintDate(startDate), endDate: parseSprintDate(endDate) })
      : complete({ sprintId: sprint.id }),
    onSuccess: async () => {
      toast.show(`${sprint.name} ${starting ? "started" : "completed"}`, { variant: "success" });
      await onChanged();
      onClose();
    },
  });
  const close = () => { if (!change.isPending) onClose(); };
  const action = starting ? "Start sprint" : "Complete sprint";
  return (
    <Modal title={action} open onOpenChange={(open) => !open && close()}>
      <Modal.Content>
        <Text style={{ color: c.foreground, fontSize: 17, fontWeight: "600" }}>{sprint.name}</Text>
        {sprint.boardName ? <Text style={{ color: c.foregroundMuted }}>{sprint.boardName}</Text> : null}
        {starting ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: c.foregroundMuted }}>Dates use your local timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</Text>
            {([ ["Start date", startDate, setStartDate], ["End date", endDate, setEndDate] ] as const).map(([label, value, update]) => (
              <View key={label} style={{ gap: 5 }}>
                <Text style={{ color: c.foregroundMuted }}>{label}</Text>
                <TextInput accessibilityLabel={label} value={value} onChangeText={update} editable={!change.isPending}
                  placeholder="YYYY-MM-DD HH:mm" placeholderTextColor={c.foregroundMuted} autoCapitalize="none"
                  style={{ color: c.foreground, borderWidth: 1, borderColor: c.border, borderRadius: 6, minHeight: 42, padding: 10 }} />
              </View>
            ))}
            {validation ? <Text style={{ color: c.statusDanger }}>{validation}</Text> : null}
          </View>
        ) : (
          <Text style={{ color: c.foreground }}>Complete this active sprint in Jira? Issue statuses will stay as they are. Review any unfinished work in Jira before completing.</Text>
        )}
        {change.error ? <Text style={{ color: c.statusDanger }}>{change.error.message}</Text> : null}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 }}>
          <Action label="Cancel" theme={theme} disabled={change.isPending} onPress={close} />
          <Action label={change.isPending ? (starting ? "Starting…" : "Completing…") : action} theme={theme} primary
            disabled={!!validation || change.isPending} onPress={() => change.mutate()} />
        </View>
      </Modal.Content>
    </Modal>
  );
}
