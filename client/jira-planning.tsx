import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Modal, ScrollView, useToast } from "@getpaseo/plugin/client/ui";
import { completeSprintRpc, previewCompleteSprintRpc, setStoryPointsRpc, startSprintRpc, storyPointsRpc, type Sprint } from "../shared/jira";
import { formatSprintDate, parseSprintDate, parseStoryPoints } from "../shared/planning";
import { SprintDateTimeField } from "./sprint-date-time-field";

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

export function SprintActionModal({ sprint, theme, onClose, onChanged, compact = false }: CommonProps & { sprint: Sprint; compact?: boolean }) {
  const start = useRpc(startSprintRpc);
  const complete = useRpc(completeSprintRpc);
  const previewComplete = useRpc(previewCompleteSprintRpc);
  const toast = useToast();
  const c = theme.colors;
  const starting = sprint.state === "future";
  const [pickingDate, setPickingDate] = useState<string | null>(null);
  const preview = useQuery({
    queryKey: ["jira-complete-sprint", sprint.id], queryFn: () => previewComplete({ sprintId: sprint.id }),
    enabled: !starting, staleTime: 0, refetchOnWindowFocus: false, retry: false,
  });
  const plan = preview.data;
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
      : complete({ sprintId: sprint.id, confirmation: plan!.confirmation }),
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
              <SprintDateTimeField key={label} label={label} value={value} onChange={update} theme={theme} disabled={change.isPending} compact={compact}
                expanded={pickingDate === label} onToggle={() => setPickingDate((current) => current === label ? null : label)} />
            ))}
            {validation ? <Text style={{ color: c.statusDanger }}>{validation}</Text> : null}
          </View>
        ) : preview.isPending ? <ActivityIndicator color={c.foregroundMuted} /> : preview.error ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: c.statusDanger }}>{preview.error.message}</Text>
            <Action label="Retry preview" theme={theme} disabled={preview.isFetching} onPress={() => { void preview.refetch(); }} />
          </View>
        ) : plan ? (
          <View style={{ gap: 12 }}>
            <Text style={{ color: c.foreground }}>{plan.doneCount} Done · {plan.incomplete.length} unfinished · {plan.totalCount} total</Text>
            {plan.finished ? <Text style={{ color: c.foreground }}>This sprint and its confirmed issue moves are already complete.</Text> : (
              <>
                {plan.recovering ? <Text style={{ color: c.statusWarning }}>This sprint is already closed. Retry to finish the previously confirmed issue moves.</Text> : null}
                {plan.incomplete.length ? (
                  <>
                    <View style={{ gap: 6, padding: 12, borderWidth: 1, borderColor: c.border, borderRadius: 8 }}>
                      <Text style={{ color: c.foregroundMuted }}>Move unfinished work to</Text>
                      <Text style={{ color: c.foreground, fontWeight: "600" }}>{plan.destination?.name ?? "Backlog"}</Text>
                      <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
                        {plan.destination ? `Next upcoming sprint on ${plan.boardName}, in board order.` : `No upcoming sprint exists on ${plan.boardName}.`}
                      </Text>
                    </View>
                    <ScrollView style={{ maxHeight: 280 }}>
                      <View style={{ gap: 10 }}>
                        {plan.incomplete.map((issue) => (
                          <View key={issue.id} style={{ gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
                            <Text style={{ color: c.foreground, lineHeight: 20 }}><Text style={{ fontWeight: "600" }}>{issue.key}</Text> · {issue.title}</Text>
                            <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>{issue.status}{issue.parentKey ? ` · Moves with parent ${issue.parentKey}` : ""}</Text>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                    <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>Confirm to complete this sprint and move the listed unfinished work. Issue statuses will stay as they are.</Text>
                  </>
                ) : <Text style={{ color: c.foreground }}>All visible sprint issues are Done. Confirm to complete this sprint.</Text>}
                {plan.blockedReason ? <Text style={{ color: c.statusDanger }}>{plan.blockedReason}</Text> : null}
              </>
            )}
          </View>
        ) : null}
        {change.error ? <Text style={{ color: c.statusDanger }}>{change.error.message}</Text> : null}
        {!starting && !change.isPending ? <Action label="Refresh preview" theme={theme} disabled={preview.isFetching} onPress={() => { change.reset(); void preview.refetch(); }} /> : null}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 }}>
          <Action label="Cancel" theme={theme} disabled={change.isPending} onPress={close} />
          <Action label={change.isPending ? (starting ? "Starting…" : "Completing…") : starting ? action : plan?.recovering ? "Retry confirmed move" : "Confirm completion"} theme={theme} primary
            disabled={!!validation || change.isPending || (!starting && (!plan || preview.isFetching || preview.isError || !!plan.blockedReason || plan.finished))} onPress={() => change.mutate()} />
        </View>
      </Modal.Content>
    </Modal>
  );
}
