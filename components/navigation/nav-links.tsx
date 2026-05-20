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
  Menu,
  ReceiptText,
  Settings,
  ShoppingCart,
  Trophy,
  Users,
  X
} from "lucide-react";
import { useState } from "react";
import type { Role } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/daily-tasks", label: "Daily Tasks", icon: ClipboardCheck },
  { href: "/monthly-performance", label: "Performance", icon: ChartSpline, managerOnly: true },
  { href: "/stock-accounts", label: "Stock", icon: Boxes },
  { href: "/sales", label: "Sales", icon: ShoppingCart },
  { href: "/sold-accounts", label: "Sold Accounts", icon: ReceiptText },
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
  const items = visibleNavItems(role);

  return (
    <div className="flex gap-1 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-w-[4.75rem] flex-col items-center gap-1 rounded-md px-1 py-2 text-[10px] font-medium leading-tight text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:min-w-[5.5rem] sm:text-[11px]",
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

export function MobileMenuPanel({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const items = visibleNavItems(role);

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Menu className="h-4 w-4" />
        Menu
      </Button>

      {open ? (
        <div data-mobile-menu-panel="true" className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm lg:hidden">
          <div className="ml-auto flex h-full w-full max-w-sm flex-col border-l bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Navigation</p>
                <h2 className="text-lg font-semibold">All Modules</h2>
              </div>
              <Button type="button" size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <nav className="grid min-h-0 flex-1 auto-rows-min gap-2 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
              {items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md border px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      active && "border-primary/30 bg-primary/12 text-primary"
                    )}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
