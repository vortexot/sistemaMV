import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Props {
  to?: string;
  testId?: string;
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  className?: string;
}

const LOGO_SIZES = { sm: "h-9 w-9", md: "h-11 w-11", lg: "h-16 w-16" };
const TEXT_SIZES = { sm: "text-xs", md: "text-sm", lg: "text-lg" };

/** MV Multimarcas brand mark: the crown emblem logo plus the wordmark. */
export default function BrandMark({
  to = "/",
  testId = "brand-mark",
  size = "md",
  showWordmark = true,
  className,
}: Props) {
  const content = (
    <>
      <img
        src="/mv-logo.jpg"
        alt="MV Multimarcas"
        className={cn(
          "shrink-0 rounded-lg border border-[#DAA520]/30 object-cover",
          LOGO_SIZES[size],
        )}
      />
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              "font-heading font-extrabold uppercase tracking-[0.22em] text-white",
              TEXT_SIZES[size],
            )}
          >
            MV
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#DAA520]">
            Multimarcas
          </span>
        </span>
      )}
    </>
  );

  if (!to) {
    return <div className={cn("flex items-center gap-3", className)}>{content}</div>;
  }

  return (
    <Link to={to} data-testid={testId} className={cn("flex items-center gap-3", className)}>
      {content}
    </Link>
  );
}