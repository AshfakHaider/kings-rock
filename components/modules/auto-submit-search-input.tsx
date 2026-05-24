"use client";

import type React from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

export function AutoSubmitSearchInput({
  delay = 180,
  pageParam = "page",
  name = "q",
  defaultValue,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { delay?: number; pageParam?: string }) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [value, setValue] = useState(String(defaultValue ?? ""));

  useEffect(() => {
    setValue(String(defaultValue ?? ""));
  }, [defaultValue]);

  return (
    <Input
      {...props}
      name={name}
      value={value}
      onChange={(event) => {
        props.onChange?.(event);
        const nextValue = event.currentTarget.value;
        setValue(nextValue);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        timeoutRef.current = setTimeout(() => {
          const params = new URLSearchParams(searchParams.toString());
          const query = nextValue.trim();

          if (query) {
            params.set(name, query);
          } else {
            params.delete(name);
          }

          params.delete(pageParam);

          const nextQuery = params.toString();
          startTransition(() => {
            router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
          });
        }, delay);
      }}
    />
  );
}
