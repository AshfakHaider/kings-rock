import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient, hasSupabaseEnv, REMEMBER_SESSION_COOKIE } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DesktopNavLinks, MobileMenuPanel, MobileNavLinks } from "@/components/navigation/nav-links";
import { ThemeToggle } from "@/components/theme/theme-toggle";

async function signOut() {
  "use server";
  const cookieStore = await cookies();
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  cookieStore.delete(REMEMBER_SESSION_COOKIE);
  cookieStore.delete("demo_role");
  cookieStore.delete("demo_profile_id");
  redirect("/login");
}

export function AppShell({
  children,
  profile,
  businessName
}: {
  children: React.ReactNode;
  profile: Profile;
  businessName: string;
}) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r bg-card p-3 lg:block xl:p-4">
        <div className="flex h-full min-h-0 flex-col">
          <div className="glass-panel shrink-0 rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Business Manager</p>
                <h2 className="mt-1 truncate text-lg font-semibold">{businessName}</h2>
              </div>
              <ThemeToggle />
            </div>
          </div>

          <DesktopNavLinks role={profile.role} />

          <Card className="mt-3 shrink-0 p-4 shadow-none">
            <p className="truncate font-medium">{profile.name}</p>
            <p className="text-sm capitalize text-muted-foreground">{profile.role}</p>
            <form action={signOut} className="mt-3">
              <Button size="sm" variant="outline" className="w-full">
                Sign out
              </Button>
            </form>
          </Card>
        </div>
      </aside>

      <main className="min-w-0 px-4 pb-[calc(env(safe-area-inset-bottom)+9rem)] pt-4 sm:px-6 lg:ml-72 lg:px-6 lg:py-8 xl:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 lg:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Business Manager</p>
            <p className="truncate font-semibold">{businessName}</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <MobileMenuPanel role={profile.role} />
            <form action={signOut}>
              <Button type="submit" size="sm" variant="outline">
                Sign out
              </Button>
            </form>
            <ThemeToggle />
          </div>
        </div>
        <div className="mx-auto w-full max-w-[1600px] space-y-6">{children}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 shadow-soft backdrop-blur lg:hidden">
        <MobileNavLinks role={profile.role} />
      </nav>
    </div>
  );
}
