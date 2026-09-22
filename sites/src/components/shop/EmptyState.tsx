import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  testId?: string;
  className?: string;
}

export default function EmptyState({ icon: Icon, title, description, action, testId, className }: Props) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#242424] bg-[#151515]/60 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1E1A08]">
        <Icon className="h-6 w-6 text-[#DAA520]" />
      </div>
      <h3 className="font-heading text-lg font-bold text-white">{title}</h3>
      {description && <p className="max-w-md text-sm text-[#BDBDBD]">{description}</p>}
      {action}
    </div>
  );
}