import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { CookieOptions } from "@supabase/ssr";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export const REMEMBER_SESSION_COOKIE = "kr_remember_session";

function applyRememberPreference(options: CookieOptions, rememberPreference?: string) {
  if (rememberPreference !== "session") return options;

  const sessionOptions = { ...options };
  delete sessionOptions.expires;
  delete sessionOptions.maxAge;
  return sessionOptions;
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            const rememberPreference = cookieStore.get(REMEMBER_SESSION_COOKIE)?.value;
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, applyRememberPreference(options, rememberPreference))
            );
          } catch {
            // Server components cannot always set cookies. Middleware refreshes sessions.
          }
        }
      }
    }
  );
}

export function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function allowDemoMode() {
  return (
    process.env.NEXT_PUBLIC_ALLOW_DEMO_MODE === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

export function hasSupabaseAdminEnv() {
  return Boolean(hasSupabaseEnv() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createAdminClient() {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for this server action.");
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}
