"use client";

import type React from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

export function AutoSubmitSearchInput({
  delay = 180,
  pageParam = "page",
  name = "q",
  defaultValue,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { delay?: number; pageParam?: string }) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedRef = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [value, setValue] = useState(String(defaultValue ?? ""));

  useEffect(() => {
    if (!focusedRef.current) setValue(String(defaultValue ?? ""));
  }, [defaultValue]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function updateRoute(nextValue: string) {
    const params = new URLSearchParams(window.location.search);
    const query = nextValue.trim();

    if (query) {
      params.set(name, query);
    } else {
      params.delete(name);
    }

    params.delete(pageParam);

    const nextQuery = params.toString();
    const nextPath = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    const currentPath = `${window.location.pathname}${window.location.search}`;

    if (nextPath === currentPath) return;

    startTransition(() => {
      router.replace(nextPath, { scroll: false });
    });
  }

  return (
    <Input
      {...props}
      name={name}
      value={value}
      autoComplete="off"
      spellCheck={false}
      onFocus={(event) => {
        focusedRef.current = true;
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        focusedRef.current = false;
        props.onBlur?.(event);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        updateRoute(event.currentTarget.value);
      }}
      onChange={(event) => {
        props.onChange?.(event);
        const nextValue = event.currentTarget.value;
        setValue(nextValue);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        timeoutRef.current = setTimeout(() => {
          updateRoute(nextValue);
        }, delay);
      }}
    />
  );
}
