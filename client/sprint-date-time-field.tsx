import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Icon, ScrollView as PickerScrollView } from "@getpaseo/plugin/client/ui";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { formatSprintDate, parseSprintDate } from "../shared/planning";
import { FloatingPopover } from "./floating-popover";

function TimeColumn({ label, part, total, current, theme, disabled, onChoose, compact }: {
  label: string; part: "hour" | "minute"; total: number; current: number; theme: PluginScreenProps["theme"];
  disabled: boolean; onChoose(number: number): void; compact: boolean;
}) {
  const ref = useRef<ScrollView>(null);
  const c = theme.colors;
  const position = () => ref.current?.scrollTo({ y: Math.max(0, current - 1) * 36, animated: false });
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>{part === "hour" ? "Hour" : "Minute"}</Text>
      <PickerScrollView ref={ref} onLayout={position} onContentSizeChange={position}
        style={{ height: compact ? 108 : 260, borderWidth: 1, borderColor: c.border, borderRadius: 6 }} nestedScrollEnabled>
        {Array.from({ length: total }, (_, number) => (
          <Pressable key={number} accessibilityRole="button" accessibilityLabel={`${label}: ${part} ${String(number).padStart(2, "0")}`}
            accessibilityState={{ selected: current === number, disabled }} disabled={disabled} onPress={() => onChoose(number)}
            style={({ pressed }) => ({ height: 36, alignItems: "center", justifyContent: "center", backgroundColor: current === number || pressed ? c.surface2 : "transparent" })}>
            <Text style={{ color: current === number ? c.accent : c.foreground, fontWeight: current === number ? "600" : "400" }}>{String(number).padStart(2, "0")}</Text>
          </Pressable>
        ))}
      </PickerScrollView>
    </View>
  );
}

export function SprintDateTimeField({ label, value, onChange, theme, disabled, expanded, onToggle, compact = false }: {
  label: string; value: string; onChange(value: string): void; theme: PluginScreenProps["theme"];
  disabled: boolean; expanded: boolean; onToggle(): void; compact?: boolean;
}) {
  const c = theme.colors;
  const anchor = useRef<View>(null);
  let selected: Date;
  try { selected = new Date(parseSprintDate(value)); } catch { selected = new Date(); }
  const year = selected.getFullYear(), month = selected.getMonth();
  const [visibleMonth, setVisibleMonth] = useState({ year, month });
  useEffect(() => { if (expanded) setVisibleMonth({ year, month }); }, [expanded, year, month]);
  const first = new Date(visibleMonth.year, visibleMonth.month, 1);
  const leading = (first.getDay() + 6) % 7;
  const count = new Date(visibleMonth.year, visibleMonth.month + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((leading + count) / 7) * 7 }, (_, index) => {
    const day = index - leading + 1;
    return day > 0 && day <= count ? day : null;
  });
  const browse = (offset: number) => {
    const next = new Date(visibleMonth.year, visibleMonth.month + offset, 1);
    setVisibleMonth({ year: next.getFullYear(), month: next.getMonth() });
  };
  const choose = (part: "day" | "hour" | "minute", number: number) => {
    const next = part === "day"
      ? new Date(visibleMonth.year, visibleMonth.month, number, selected.getHours(), selected.getMinutes())
      : new Date(selected);
    if (part === "hour") next.setHours(number);
    if (part === "minute") next.setMinutes(number);
    onChange(formatSprintDate(next));
  };
  const pad = (number: number) => String(number).padStart(2, "0");
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.foregroundMuted }}>{label}</Text>
      <Pressable ref={anchor} accessibilityRole="button" accessibilityLabel={`${label}: ${value}. Choose date and time`}
        accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={onToggle}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44,
          borderWidth: 1, borderColor: expanded ? c.accent : c.border, borderRadius: 6, paddingHorizontal: 12,
          backgroundColor: pressed ? c.surface2 : "transparent", opacity: disabled ? 0.5 : 1 })}>
        <Icon name="CalendarDays" size={16} color={c.foregroundMuted} />
        <Text style={{ color: c.foreground, flex: 1 }}>{value.slice(0, 10)}</Text>
        <Icon name="Clock" size={15} color={c.foregroundMuted} />
        <Text style={{ color: c.foreground }}>{value.slice(11)}</Text>
        <Icon name={expanded ? "ChevronUp" : "ChevronDown"} size={14} color={c.foregroundMuted} />
      </Pressable>
      {expanded ? (
        <FloatingPopover anchor={anchor} label={label} onClose={onToggle}>
        <View style={{ gap: 12, padding: 12, borderWidth: 1, borderColor: c.border, borderRadius: 8, backgroundColor: c.surface1,
          shadowColor: "#000000", shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12 }}>
          <View style={{ flexDirection: compact ? "column" : "row", gap: 12 }}>
          <View style={{ flex: 1, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${label}: previous month`} disabled={disabled}
              onPress={() => browse(-1)} style={{ minHeight: 40, minWidth: 40, justifyContent: "center", alignItems: "center" }}>
              <Icon name="ChevronLeft" size={18} color={c.foreground} />
            </Pressable>
            <Text style={{ color: c.foreground, fontWeight: "600" }}>{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`${label}: next month`} disabled={disabled}
              onPress={() => browse(1)} style={{ minHeight: 40, minWidth: 40, justifyContent: "center", alignItems: "center" }}>
              <Icon name="ChevronRight" size={18} color={c.foreground} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row" }}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => (
              <Text key={name} style={{ color: c.foregroundMuted, width: "14.285714%", textAlign: "center", fontSize: 11 }}>{name}</Text>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {cells.map((day, index) => {
              const checked = day === selected.getDate() && visibleMonth.year === year && visibleMonth.month === month;
              return (
                <View key={index} style={{ width: "14.285714%", padding: 2 }}>
                  {day ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${visibleMonth.year}-${pad(visibleMonth.month + 1)}-${pad(day)}`}
                      accessibilityState={{ selected: checked, disabled }} disabled={disabled} onPress={() => choose("day", day)}
                      style={({ pressed }) => ({ minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: 6,
                        backgroundColor: checked ? c.accent : pressed ? c.surface2 : "transparent" })}>
                      <Text style={{ color: checked ? c.accentForeground : c.foreground, fontWeight: checked ? "600" : "400" }}>{day}</Text>
                    </Pressable>
                  ) : <View style={{ height: 36 }} />}
                </View>
              );
            })}
          </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8, width: compact ? "100%" : 116 }}>
            {([ ["Hour", "hour", 24, selected.getHours()], ["Minute", "minute", 60, selected.getMinutes()] ] as const).map(([name, part, total, current]) => (
              <TimeColumn key={name} label={label} part={part} total={total} current={current} theme={theme} disabled={disabled}
                compact={compact} onChoose={(number) => choose(part, number)} />
            ))}
          </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Done choosing ${label.toLowerCase()}`} disabled={disabled} onPress={onToggle}
            style={{ alignSelf: "flex-end", paddingHorizontal: 14, minHeight: 36, justifyContent: "center" }}>
            <Text style={{ color: c.accent, fontWeight: "600" }}>Done</Text>
          </Pressable>
        </View>
        </FloatingPopover>
      ) : null}
    </View>
  );
}
