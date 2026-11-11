import { Platform } from "react-native";

// The only browser-specific boundary. Popover content remains React Native UI.
type PopoverNode = {
  showPopover?(options?: { source: unknown }): void;
  hidePopover(): void;
  setAttribute(name: string, value: string): void;
  getBoundingClientRect(): { top: number; bottom: number; left: number; width: number; height: number };
  contains(target: unknown): boolean;
  style: { [property: string]: string };
  addEventListener(name: string, callback: (event: { newState?: string }) => void): void;
  removeEventListener(name: string, callback: (event: { newState?: string }) => void): void;
};
declare const window: {
  innerWidth: number; innerHeight: number;
  addEventListener(name: string, callback: (event: { target: unknown }) => void, capture?: boolean): void;
  removeEventListener(name: string, callback: (event: { target: unknown }) => void, capture?: boolean): void;
};

/** Promote an existing RN View to the browser's top layer, above modal overflow clipping. */
export function mountWebPopover(surface: unknown, anchor: unknown, onDismiss: () => void): (() => void) | null {
  if (Platform.OS !== "web") return null;
  const node = surface as PopoverNode | null;
  const trigger = anchor as PopoverNode | null;
  if (!node?.showPopover || !trigger?.getBoundingClientRect) return null;
  let active = true;
  const position = () => {
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(460, window.innerWidth - 24);
    node.style.width = `${width}px`;
    node.style.maxHeight = `${window.innerHeight - 24}px`;
    const height = node.getBoundingClientRect().height;
    const below = rect.bottom + 6;
    const above = rect.top - height - 6;
    node.style.top = `${below + height <= window.innerHeight - 12 ? below : Math.max(12, above)}px`;
    node.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
    node.style.opacity = "1";
  };
  const toggle = (event: { newState?: string }) => { if (active && event.newState === "closed") onDismiss(); };
  const scroll = (event: { target: unknown }) => { if (!node.contains(event.target)) position(); };
  const resize = () => position();
  node.setAttribute("popover", "auto");
  Object.assign(node.style, { position: "fixed", inset: "auto", margin: "0", padding: "0", border: "0", background: "transparent" });
  node.addEventListener("toggle", toggle);
  node.showPopover({ source: trigger });
  position();
  window.addEventListener("scroll", scroll, true);
  window.addEventListener("resize", resize);
  return () => {
    active = false;
    node.removeEventListener("toggle", toggle);
    window.removeEventListener("scroll", scroll, true);
    window.removeEventListener("resize", resize);
    node.hidePopover();
  };
}
