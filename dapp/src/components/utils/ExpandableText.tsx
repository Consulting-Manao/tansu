import { useState } from "react";
import { Button } from "components/ui";

interface ExpandableTextProps {
  children?: string | null;
  className?: string;
}

export function ExpandableText({
  children,
  className = "",
}: ExpandableTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (children?.trim()) {
    return (
      <div className={`relative flex flex-col items-start gap-3 ${className}`}>
        <p
          className={`text-lg text-ink ${isExpanded ? "whitespace-pre-wrap" : "line-clamp-2"} transition-all duration-300`}
        >
          {children}
        </p>
        <Button
          tone="secondary"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="w-1 h-1 bg-action" />
          <div className="w-1 h-1 bg-action" />
          <div className="w-1 h-1 bg-action" />
        </Button>
      </div>
    );
  }

  return <p className="text-lg text-ink">-</p>;
}
