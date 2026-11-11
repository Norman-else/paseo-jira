import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { Modal, ScrollView } from "@getpaseo/plugin/client/ui";
import { mountWebPopover } from "./web";

export function FloatingPopover({ anchor, label, onClose, children }: {
  anchor: RefObject<View | null>; label: string; onClose(): void; children: ReactNode;
}) {
  const surface = useRef<View>(null);
  const dismiss = useRef(onClose);
  dismiss.current = onClose;
  const { height } = useWindowDimensions();
  const [fallback, setFallback] = useState(Platform.OS !== "web");
  useLayoutEffect(() => {
    if (fallback) return;
    const cleanup = mountWebPopover(surface.current, anchor.current, () => dismiss.current());
    if (!cleanup) setFallback(true);
    return cleanup ?? undefined;
  }, [anchor, fallback]);
  if (fallback) {
    return <Modal title={`Choose ${label.toLowerCase()}`} open onOpenChange={(open) => !open && onClose()}><Modal.Content>{children}</Modal.Content></Modal>;
  }
  return (
    <View ref={surface} accessibilityLabel={`Choose ${label.toLowerCase()}`} style={{ position: "absolute", opacity: 0, width: 460, maxHeight: height - 24, zIndex: 1000 }}>
      <ScrollView style={{ maxHeight: height - 24 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    </View>
  );
}
