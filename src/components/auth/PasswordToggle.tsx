import { Eye, EyeOff } from "lucide-react";

interface PasswordToggleProps {
  visible: boolean;
  onToggle: () => void;
  variant?: "light" | "dark";
}

export function PasswordToggle({ visible, onToggle, variant = "light" }: PasswordToggleProps) {
  const colorClass =
    variant === "light" ? "text-muted-foreground hover:text-foreground" : "text-white/40 hover:text-white/70";
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`absolute top-1/2 right-3 -translate-y-1/2 transition-colors ${colorClass}`}
      aria-label={visible ? "Hide password" : "Show password"}
    >
      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}
