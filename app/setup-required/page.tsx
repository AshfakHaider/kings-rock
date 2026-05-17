import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SetupRequiredPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Live Setup Required</CardTitle>
          <CardDescription>
            Supabase environment variables are missing. Demo mode is disabled for this deployment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Add these environment variables in Vercel, then redeploy:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>NEXT_PUBLIC_SUPABASE_URL</li>
            <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
            <li>SUPABASE_SERVICE_ROLE_KEY</li>
            <li>GMAIL_PASSWORD_ENCRYPTION_KEY</li>
          </ul>
          <p>For local testing only, set NEXT_PUBLIC_ALLOW_DEMO_MODE=true.</p>
        </CardContent>
      </Card>
    </main>
  );
}
