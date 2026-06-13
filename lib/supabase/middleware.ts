import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

const REMEMBER_SESSION_COOKIE = "kr_remember_session";

function applyRememberPreference(options: CookieOptions, rememberPreference?: string) {
  if (rememberPreference !== "session") return options;

  const sessionOptions = { ...options };
  delete sessionOptions.expires;
  delete sessionOptions.maxAge;
  return sessionOptions;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const rememberPreference = request.cookies.get(REMEMBER_SESSION_COOKIE)?.value;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, applyRememberPreference(options, rememberPreference))
          );
        }
      }
    }
  );

  await supabase.auth.getUser();
  return response;
}
