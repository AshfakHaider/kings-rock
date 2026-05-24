"use client";

import type React from "react";
import { useRef } from "react";
import { Input } from "@/components/ui/input";

export function AutoSubmitSearchInput({
  delay = 450,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { delay?: number }) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <Input
      {...props}
      onChange={(event) => {
        props.onChange?.(event);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        const form = event.currentTarget.form;

        timeoutRef.current = setTimeout(() => {
          form?.requestSubmit();
        }, delay);
      }}
    />
  );
}
