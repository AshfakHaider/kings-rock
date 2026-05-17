import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function sendResetLink(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/forgot-password?error=Email%20is%20required");

  if (!hasSupabaseEnv()) {
    redirect("/login?message=Password%20reset%20emails%20require%20Supabase%20configuration.");
  }

  const headerStore = await headers();
  const origin = headerStore.get("origin") ?? "";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`
  });

  if (error) redirect(`/forgot-password?error=${encodeURIComponent(error.message)}`);
  redirect("/login?message=Password%20reset%20link%20sent.%20Please%20check%20your%20email.");
}

export default async function ForgotPasswordPage({
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
            <KeyRound className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Forgot Password</CardTitle>
          <CardDescription>Enter your email and we will send a reset link.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={sendResetLink} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" required />
            </div>
            {params.error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {params.error}
              </p>
            ) : null}
            <Button className="w-full">Send reset link</Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Login
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
