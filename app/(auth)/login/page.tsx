import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Gamepad2 } from "lucide-react";
import Link from "next/link";
import { createAdminClient, createClient, hasSupabaseAdminEnv, hasSupabaseEnv } from "@/lib/supabase/server";
import { getDemoProfiles } from "@/lib/demo-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function login(formData: FormData) {
  "use server";
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!hasSupabaseEnv()) {
    const profile = (await getDemoProfiles()).find(
      (item) =>
        item.email.toLowerCase() === identifier.toLowerCase() ||
        item.phone === identifier
    );

    if (!profile || profile.status !== "active") {
      redirect("/login?error=Employee%20not%20found%20or%20inactive");
    }

    const cookieStore = await cookies();
    cookieStore.set("demo_role", profile.role, { path: "/", sameSite: "lax" });
    cookieStore.set("demo_profile_id", profile.id, { path: "/", sameSite: "lax" });
    redirect("/");
  }

  let email = identifier;

  if (!identifier.includes("@")) {
    if (!hasSupabaseAdminEnv()) {
      redirect("/login?error=Phone%20login%20requires%20the%20service%20role%20key");
    }

    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("email,status")
      .eq("phone", identifier)
      .maybeSingle();

    if (!data || data.status !== "active") {
      redirect("/login?error=Employee%20not%20found%20or%20inactive");
    }

    email = data.email;
  }

  const supabase = await createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });

  if (!error) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("auth_user_id", signInData.user.id)
      .maybeSingle();

    if (!profile) {
      await supabase.auth.signOut();
      redirect("/login?error=Account%20profile%20not%20found");
    }

    if (profile.status !== "active") {
      await supabase.auth.signOut();
      redirect("/login?error=Your%20account%20is%20waiting%20for%20admin%20approval");
    }

    redirect("/");
  }
  redirect(`/login?error=${encodeURIComponent(error.message)}`);
}

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string; message?: string }>;
}) {
  const params = (await searchParams) ?? {};

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Gamepad2 className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>Manage stock, sales, Gmail inventory, funds, and reports.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={login} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">Email or phone</Label>
              <Input id="identifier" name="identifier" type="text" placeholder="admin@example.com or +88017..." required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            {params.error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {params.error}
              </p>
            ) : null}
            {params.message ? (
              <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                {params.message}
              </p>
            ) : null}
            <Button className="w-full">Login</Button>
          </form>
          <div className="mt-4 flex flex-col gap-2 text-center text-sm sm:flex-row sm:items-center sm:justify-between">
            <Link href="/forgot-password" className="text-primary hover:underline">
              Forgot password?
            </Link>
            <Link href="/create-account" className="text-primary hover:underline">
              Create account
            </Link>
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            New accounts require admin approval before login.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
