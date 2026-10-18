"use client";

import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Small convenience wrapper around the base Tooltip primitives so we can
 * attach a hover hint to any trigger without the usual Tooltip/TooltipTrigger
 * /TooltipContent boilerplate repeated throughout the UI.
 *
 * A `TooltipProvider` must already exist higher up in the tree (it lives in
 * `app/layout.tsx` for this app).
 *
 * Usage:
 *   <InfoTooltip content={<><b>Sandbox</b><br/>Shared file workspace…</>}>
 *     <button>…</button>
 *   </InfoTooltip>
 *
 * The child is rendered verbatim via `asChild`, so pass one focusable
 * element (button / link / div with role="button"). Content may be a string
 * or rich ReactNode; we render it inside a compact two-line panel with a
 * slightly wider max-width than the default so explanatory copy fits.
 */
export interface InfoTooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: React.ComponentProps<typeof TooltipContent>["side"];
  align?: React.ComponentProps<typeof TooltipContent>["align"];
  sideOffset?: number;
  delayDuration?: number;
  className?: string;
  /** Hide the tooltip when content is falsy — convenient for optional hints. */
  disabled?: boolean;
}

export function InfoTooltip({
  content,
  children,
  side = "top",
  align,
  sideOffset = 6,
  delayDuration,
  className,
  disabled,
}: InfoTooltipProps) {
  if (disabled || content == null || content === false || content === "") {
    return children;
  }
  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "max-w-xs whitespace-normal text-xs leading-relaxed [&_b]:font-semibold [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-background/30 [&_kbd]:bg-background/20 [&_kbd]:px-1 [&_kbd]:py-0.5 [&_kbd]:text-[10px] [&_kbd]:font-mono",
          className,
        )}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
