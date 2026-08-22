"use client";

import { Command as CommandPrimitive } from "cmdk";
import { cn } from "@/lib/utils";

export function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn("flex w-full flex-col overflow-hidden rounded-md bg-white", className)}
      {...props}
    />
  );
}

export function CommandInput(props: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center border-b border-neutral-200 px-3">
      <CommandPrimitive.Input
        className="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-neutral-400"
        {...props}
      />
    </div>
  );
}

export function CommandList(props: React.ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List className="max-h-64 overflow-y-auto p-1" {...props} />;
}

export function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="py-6 text-center text-sm text-neutral-500" {...props} />;
}

export function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none aria-selected:bg-neutral-100",
        className,
      )}
      {...props}
    />
  );
}
