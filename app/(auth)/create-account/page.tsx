import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { createAdminClient, hasSupabaseAdminEnv, hasSupabaseEnv } from "@/lib/supabase/server";
import { upsertDemoProfile, getDemoProfiles } from "@/lib/demo-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function createAccount(formData: FormData) {
  "use server";

  const name = value(formData, "name");
  const email = value(formData, "email").toLowerCase();
  const phone = value(formData, "phone");
  const password = value(formData, "password");

  if (!name || !email || !password) {
    redirect("/create-account?error=Name%2C%20email%2C%20and%20password%20are%20required");
  }

  if (password.length < 6) {
    redirect("/create-account?error=Password%20must%20be%20at%20least%206%20characters");
  }

  if (!hasSupabaseEnv()) {
    const existing = (await getDemoProfiles()).find((profile) => profile.email.toLowerCase() === email);
    if (existing) {
      redirect("/create-account?error=An%20account%20with%20this%20email%20already%20exists");
    }

    const now = new Date().toISOString();
    await upsertDemoProfile({
      id: `employee-${randomUUID()}`,
      auth_user_id: null,
      name,
      phone: phone || null,
      email,
      role: "employee",
      status: "inactive",
      join_date: now.slice(0, 10),
      notes: "Created from public signup. Waiting for admin approval.",
      created_at: now
    });
    redirect("/login?message=Account%20created.%20Please%20wait%20for%20admin%20approval.");
  }

  if (!hasSupabaseAdminEnv()) {
    redirect("/create-account?error=Signup%20requires%20the%20Supabase%20service%20role%20key");
  }

  const admin = createAdminClient();
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      phone,
      role: "employee"
    }
  });

  if (authError || !authData.user) {
    redirect(`/create-account?error=${encodeURIComponent(authError?.message ?? "Could not create account")}`);
  }

  const now = new Date().toISOString();
  const { error: profileError } = await admin.from("profiles").insert({
    auth_user_id: authData.user.id,
    name,
    phone: phone || null,
    email,
    role: "employee",
    status: "inactive",
    join_date: now.slice(0, 10),
    notes: "Created from public signup. Waiting for admin approval."
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    redirect(`/create-account?error=${encodeURIComponent(profileError.message)}`);
  }

  redirect("/login?message=Account%20created.%20Please%20wait%20for%20admin%20approval.");
}

export default async function CreateAccountPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = (await searchParams) ?? {};

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Gamepad2 className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <CardDescription>Your account will stay locked until an admin approves it.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createAccount} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="Your name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input id="phone" name="phone" inputMode="tel" placeholder="+88017..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput id="password" name="password" minLength={6} required />
            </div>
            {params.error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {params.error}
              </p>
            ) : null}
            <Button className="w-full">Request approval</Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Login
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
