import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Seletor de opções (abas/toggle), sem dependência extra. */
export function Segmented<T extends string>(props: {
  value: T;
  options: [T, ReactNode][];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={props.label} className="inline-flex flex-wrap gap-1 rounded-md bg-card p-1">
      {props.options.map(([v, text]) => (
        <Button
          key={v}
          role="tab"
          aria-selected={props.value === v}
          size="sm"
          variant={props.value === v ? "default" : "ghost"}
          onClick={() => props.onChange(v)}
        >
          {text}
        </Button>
      ))}
    </div>
  );
}
