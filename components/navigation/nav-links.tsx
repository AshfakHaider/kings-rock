"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  Boxes,
  ChartNoAxesCombined,
  ChartSpline,
  ClipboardCheck,
  Gauge,
  Mail,
  ReceiptText,
  Settings,
  ShoppingCart,
  Trophy,
  Users
} from "lucide-react";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/daily-tasks", label: "Daily Tasks", icon: ClipboardCheck },
  { href: "/monthly-performance", label: "Performance", icon: ChartSpline, managerOnly: true },
  { href: "/stock-accounts", label: "Stock", icon: Boxes },
  { href: "/sales", label: "Sales", icon: ShoppingCart },
  { href: "/sold-accounts", label: "Sold Accounts", icon: ReceiptText },
  { href: "/gmail-inventory", label: "Gmail", icon: Mail },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/advances", label: "Funds", icon: Banknote },
  { href: "/expenses", label: "Expenses", icon: ReceiptText },
  { href: "/reports", label: "Reports", icon: ChartNoAxesCombined, managerOnly: true },
  { href: "/settings", label: "Settings", icon: Settings }
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function visibleNavItems(role: Role) {
  return navItems.filter((item) => role !== "employee" || !item.managerOnly);
}

export function DesktopNavLinks({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = visibleNavItems(role);

  return (
    <nav className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-primary/12 text-primary ring-1 ring-primary/20 dark:bg-primary/15"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNavLinks({ role }: { role: Role }) {
  const pathname = usePathname();
  const items =
    role === "employee"
      ? visibleNavItems(role).filter((item) =>
          ["/", "/leaderboard", "/daily-tasks", "/stock-accounts", "/sales", "/expenses"].includes(item.href)
        )
      : visibleNavItems(role).slice(0, 5);

  return (
    <div className={cn("grid gap-1", role === "employee" ? "grid-cols-6" : "grid-cols-5")}>
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-2 text-[10px] font-medium leading-tight text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:text-[11px]",
              active && "bg-primary/12 text-primary"
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="w-full truncate text-center">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
