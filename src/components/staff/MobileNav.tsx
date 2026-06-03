import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface Props {
  pendingCount: number;
  currentPath: string;
}

export default function MobileNav({ pendingCount: initialCount, currentPath }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
    };
    window.addEventListener("mobile-nav-open", handleOpen);
    return () => {
      window.removeEventListener("mobile-nav-open", handleOpen);
    };
  }, []);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      setCount((e as CustomEvent<number>).detail);
    };
    window.addEventListener("pending-count-update", handleUpdate);
    return () => {
      window.removeEventListener("pending-count-update", handleUpdate);
    };
  }, []);

  const close = () => {
    setIsOpen(false);
  };

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-black/50" onClick={close} />}
      <div
        className={cn(
          "bg-sidebar fixed inset-y-0 right-0 z-50 w-64 transition-transform duration-300",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <nav className="flex flex-col gap-1 p-4">
          <a
            href="/dashboard/generate-token"
            onClick={close}
            className={cn(
              "text-sidebar-foreground flex min-h-[44px] items-center px-4 text-sm transition-colors hover:text-white",
              currentPath === "/dashboard/generate-token" && "border-l-2 border-white font-semibold text-white",
            )}
          >
            Generate Token
          </a>
          <a
            href="/dashboard"
            onClick={close}
            className={cn(
              "text-sidebar-foreground flex min-h-[44px] items-center gap-2 px-4 text-sm transition-colors hover:text-white",
              currentPath === "/dashboard" && "border-l-2 border-white font-semibold text-white",
            )}
          >
            Orders
            {count > 0 && (
              <span className="bg-destructive flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white">
                {count}
              </span>
            )}
          </a>
          <form method="POST" action="/api/auth/signout">
            <button
              type="submit"
              className="text-sidebar-foreground flex min-h-[44px] w-full items-center px-4 text-sm transition-colors hover:text-white"
            >
              Sign Out
            </button>
          </form>
        </nav>
      </div>
    </>
  );
}
