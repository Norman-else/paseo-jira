import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { JiraScreen } from "./client/jira-screen";
import { JiraSettings } from "./client/settings";
import { jiraAttachments } from "./shared/jira";

function JiraItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Ticket"
      active={currentScreen?.screenId === "jira"}
      onPress={() => openScreen({ screenId: "jira" })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({
    id: "jira",
    title: "Jira",
    Component: (props) => <JiraScreen {...props} onOpenSettings={() => client.openSettings("connection")} />,
  });
  client.addSidebarHeaderItem({ id: "jira", title: "Jira", Component: JiraItem });
  client.addSettingsScreen({
    id: "connection",
    title: "Jira",
    icon: "Ticket",
    Component: (props) => <JiraSettings {...props} onBack={() => client.openScreen({ screenId: "jira" })} />,
  });
  client.addAttachmentSource(jiraAttachments);
  return () => {};
}
