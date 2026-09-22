import { useState } from "react";
import { Shirt } from "lucide-react";
import { cn } from "@/lib/utils";
import { imageSource, imageSources } from "@/lib/image-source";

interface Props {
  fileId: string | null;
  name: string;
  productId?: string;
  className?: string;
}

/** Product image served by /api/files/{file_id}, with a branded fallback when absent/broken. */
export default function ProductImage({ fileId, name, productId, className }: Props) {
  return <LoadedProductImage key={fileId} fileId={fileId} name={name} productId={productId} className={className} />;
}

function LoadedProductImage({ fileId, name, productId, className }: Props) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!fileId || failed) {
    return (
      <div
        data-testid={productId ? `product-image-fallback-${productId}` : "product-image-fallback"}
        className={cn(
          "h-full w-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#242424] via-[#151515] to-[#0B0B0B] text-center",
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
    <div className="relative h-full w-full overflow-hidden bg-[#1b1b1b]" aria-busy={!loaded}>
    {!loaded && <span aria-hidden="true" className="image-placeholder absolute inset-0" />}
    <img
      data-testid={productId ? `product-image-${productId}` : "product-image"}
      src={imageSource(fileId)}
      srcSet={imageSources(fileId)}
      sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 640px"
      alt={name}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      ref={(image) => { if (image?.complete && image.naturalWidth > 0) setLoaded(true); }}
      onError={() => setFailed(true)}
      className={cn("h-full w-full object-cover", className)}
      style={{ opacity: loaded ? 1 : 0, transitionProperty: 'opacity, transform', transitionDuration: '250ms, 500ms' }}
    />
    </div>
  );
}
