/** Responsive app bar with student management and global calendar actions. */

import { Button, Tooltip } from "@heroui/react";
import { CalendarDays, Copy, LogOut, Monitor, Moon, Sun, Users, Plug } from "lucide-react";
import { useState, type ReactNode } from "react";
import { loadThemePreference, setThemePreference, type ThemePreference } from "@/lib/theme";

const THEME_ORDER: ThemePreference[] = ["system", "light", "dark"];

const THEME_LABELS: Record<ThemePreference, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
};

function ThemeGlyph({ preference }: { preference: ThemePreference }) {
  if (preference === "light") return <Sun className="size-5" />;
  if (preference === "dark") return <Moon className="size-5" />;
  return <Monitor className="size-5" />;
}

function IconAction({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip delay={300}>
      <Button isIconOnly variant="ghost" aria-label={label} onPress={onPress}>
        {children}
      </Button>
      <Tooltip.Content>
        <p>{label}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}

export function AppBar({
  onManageConnections,
  onManageStudents,
  onCopySubscription,
  onGoToday,
  onLogout,
}: {
  onManageConnections: () => void;
  onManageStudents: () => void;
  onCopySubscription: () => void;
  onGoToday: () => void;
  onLogout: () => void;
}) {
  const [themePreference, setTheme] = useState<ThemePreference>(() => loadThemePreference());

  const cycleTheme = () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(themePreference) + 1) % THEME_ORDER.length];
    setThemePreference(next);
    setTheme(next);
  };

  return (
    <header className="shrink-0 border-b bg-surface">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <img src="/app-icon-96.png" alt="" width="40" height="40" />
          <h1 className="truncate text-lg font-semibold">排课表</h1>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <IconAction label="MCP 授权" onPress={onManageConnections}>
            <Plug className="size-5" />
          </IconAction>
          <IconAction label="学生管理" onPress={onManageStudents}>
            <Users className="size-5" />
          </IconAction>
          <IconAction label="复制订阅地址" onPress={onCopySubscription}>
            <Copy className="size-5" />
          </IconAction>
          <IconAction label="回到今天" onPress={onGoToday}>
            <CalendarDays className="size-5" />
          </IconAction>
          <IconAction
            label={`主题：${THEME_LABELS[themePreference]}（点击切换）`}
            onPress={cycleTheme}
          >
            <ThemeGlyph preference={themePreference} />
          </IconAction>
          <IconAction label="退出登录" onPress={onLogout}>
            <LogOut className="size-5" />
          </IconAction>
        </div>
      </div>
    </header>
  );
}
