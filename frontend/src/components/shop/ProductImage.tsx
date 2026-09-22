import { useState } from "react";
import { Shirt } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  fileId: string | null;
  name: string;
  productId?: string;
  className?: string;
}

/** Product image served by /api/files/{file_id}, with a branded fallback when absent/broken. */
export default function ProductImage({ fileId, name, productId, className }: Props) {
  const [failed, setFailed] = useState(false);

  if (!fileId || failed) {
    return (
      <div
        data-testid={productId ? `product-image-fallback-${productId}` : "product-image-fallback"}
        className={cn(
          "flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#242424] via-[#151515] to-[#0B0B0B] text-center",
          className,
        )}
      >
        <Shirt className="h-10 w-10 text-[#DAA520]/70" strokeWidth={1.5} />
        <span className="px-4 text-[10px] font-bold uppercase tracking-[0.25em] text-[#DAA520]">
          MV Multimarcas
        </span>
        <span className="max-w-[85%] truncate px-2 text-xs text-[#BDBDBD]">{name}</span>
      </div>
    );
  }

  return (
    <img
      data-testid={productId ? `product-image-${productId}` : "product-image"}
      src={`/api/files/${fileId}`}
      alt={name}
      width={800}
      height={1000}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}
