import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  icon: ReactNode;
  endContent?: ReactNode;
  min?: string;
  max?: string;
  variant?: "light" | "dark";
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  hint,
  icon,
  endContent,
  min,
  max,
  variant = "light",
}: FormFieldProps) {
  const isLight = variant === "light";

  const inputBase = isLight
    ? "w-full rounded-lg bg-transparent border border-input px-3 py-2 pl-10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-colors"
    : "w-full rounded-lg bg-white/10 border px-3 py-2 pl-10 text-white placeholder-white/40 focus:outline-none focus:ring-2 transition-colors";

  return (
    <div>
      <label
        htmlFor={id}
        className={cn("mb-1 block text-sm", isLight ? "text-muted-foreground" : "text-sidebar-foreground/80")}
      >
        {label}
      </label>
      <div className="relative">
        <span
          className={cn(
            "absolute top-1/2 left-3 size-4 -translate-y-1/2",
            isLight ? "text-muted-foreground" : "text-white/40",
          )}
        >
          {icon}
        </span>
        <input
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          min={min}
          max={max}
          className={cn(
            inputBase,
            error
              ? "border-destructive/60 focus:ring-destructive"
              : isLight
                ? "focus:ring-ring"
                : "focus:ring-ring border-white/20",
          )}
        />
        {endContent}
      </div>
      {error ? (
        <p className="text-destructive/70 mt-1 flex items-center gap-1 text-xs">
          <CircleAlert className="size-3" />
          {error}
        </p>
      ) : (
        hint
      )}
    </div>
  );
}
