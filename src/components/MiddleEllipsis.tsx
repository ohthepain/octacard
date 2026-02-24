import * as React from "react";

import { cn } from "@/lib/utils";

type MiddleEllipsisProps = React.HTMLAttributes<HTMLSpanElement> & {
  value: string;
};

const DEFAULT_TAIL_LENGTH = 12;

function splitForMiddleEllipsis(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { start: "", end: "" };
  }

  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex > 0 && dotIndex < trimmed.length - 1) {
    return {
      start: trimmed.slice(0, dotIndex),
      end: trimmed.slice(dotIndex),
    };
  }

  if (trimmed.length <= DEFAULT_TAIL_LENGTH) {
    return { start: trimmed, end: "" };
  }

  return {
    start: trimmed.slice(0, -DEFAULT_TAIL_LENGTH),
    end: trimmed.slice(-DEFAULT_TAIL_LENGTH),
  };
}

const MiddleEllipsis = ({ value, className, ...props }: MiddleEllipsisProps) => {
  const { start, end } = React.useMemo(() => splitForMiddleEllipsis(value), [value]);

  if (!start && !end) {
    return null;
  }

  return (
    <span className={cn("flex min-w-0 items-baseline", className)} title={value} {...props}>
      <span className="min-w-0 truncate">{start}</span>
      {end ? <span className="shrink-0">{end}</span> : null}
    </span>
  );
};

export default MiddleEllipsis;
