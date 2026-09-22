import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  ArrowRight,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
  X,
  Zap,
} from "lucide-react";

import { apiGet } from "@/lib/api";
import type { Category, Product } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import ProductCard from "@/components/shop/ProductCard";
import EmptyState from "@/components/shop/EmptyState";
import { FAQ_ITEMS } from "@/lib/site";
import { catalogFileUrl } from "@/lib/assets";

const HERO_IMAGE_BASE = "https://images.unsplash.com/photo-1559697242-a465f2578a95";
const HERO_IMAGE = `${HERO_IMAGE_BASE}?auto=format&fit=crop&w=1600&q=78`;
const HERO_IMAGE_SRCSET = [640, 960, 1280, 1600, 1920]
  .map((width) => `${HERO_IMAGE_BASE}?auto=format&fit=crop&w=${width}&q=78 ${width}w`)
  .join(", ");
const EDITORIAL_IMAGE_BASE = "https://images.unsplash.com/photo-1532332248682-206cc786359f";
const EDITORIAL_IMAGE = `${EDITORIAL_IMAGE_BASE}?auto=format&fit=crop&w=1200&q=76`;
const EDITORIAL_IMAGE_SRCSET = [480, 768, 960, 1200]
  .map((width) => `${EDITORIAL_IMAGE_BASE}?auto=format&fit=crop&w=${width}&q=76 ${width}w`)
  .join(", ");

const MARQUEE_TEXT =
  "MV MULTIMARCAS • COLEÇÃO • STREETWEAR • ROUPAS ESPORTIVAS • ";

/** Accent/case-insensitive haystack so "tenis" finds "Tênis" and "calcas" finds "Calças". */
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const FALLBACK_CATEGORIES: Category[] = [
  { id: "camisas", name: "Camisas", slug: "camisas", description: "", order: 1, active: true, image_file_id: null, created_at: "" },
  { id: "moletons", name: "Moletons", slug: "moletons", description: "", order: 2, active: true, image_file_id: null, created_at: "" },
  { id: "tenis", name: "Tênis", slug: "tenis", description: "", order: 3, active: true, image_file_id: null, created_at: "" },
  { id: "calcas", name: "Calças", slug: "calcas", description: "", order: 4, active: true, image_file_id: null, created_at: "" },
  { id: "shorts", name: "Shorts", slug: "shorts", description: "", order: 5, active: true, image_file_id: null, created_at: "" },
  { id: "acessorios", name: "Acessórios", slug: "acessorios", description: "", order: 6, active: true, image_file_id: null, created_at: "" },
];
const EMPTY_PRODUCTS: Product[] = [];
interface CustomerStory {
  title: string;
  summary: string;
  href?: string;
}

// Populate only with real customer-approved stories. Keeping this empty avoids fabricated social proof.
const CUSTOMER_STORIES: CustomerStory[] = [];

function CategoryCard({ name, slug, imageFileId }: { name: string; slug: string; imageFileId: string | null }) {
  return (
    <Link
      to={`/?cat=${slug}#colecao`}
      data-testid={`category-card-${slug}`}
      className="group relative flex h-44 flex-col justify-end overflow-hidden rounded-xl border border-[#242424] bg-[#151515] transition-all duration-300 hover:-translate-y-1.5 hover:border-[#DAA520] hover:shadow-[0_12px_24px_rgba(255,210,28,0.1)]"
    >
      {imageFileId && (
        <img
          src={catalogFileUrl(imageFileId)}
          alt={name}
          width={640}
          height={440}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover opacity-60 transition-all duration-500 group-hover:scale-105 group-hover:opacity-80"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0B] via-[#0B0B0B]/40 to-transparent" />
      <div className="relative z-10 flex items-center justify-between p-5">
        <h3 className="font-heading text-lg font-extrabold uppercase tracking-wide text-white transition-colors group-hover:text-[#DAA520]">
          {name}
        </h3>
        <ArrowRight className="h-4 w-4 text-[#DAA520] transition-transform duration-300 group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

function SectionHeader({ eyebrow, title, testId, id }: { eyebrow: string; title: string; testId: string; id?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mb-8"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#DAA520]">{eyebrow}</p>
      <h2
        id={id}
        data-testid={testId}
        className="mt-2 font-heading text-2xl font-extrabold uppercase tracking-tight text-white sm:text-3xl lg:text-4xl"
      >
        {title}
      </h2>
    </motion.div>
  );
}

function ProductSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#242424] bg-[#151515]">
      <div className="aspect-[4/5] animate-pulse bg-[#242424]/60" />
      <div className="space-y-3 p-5">
        <div className="h-3 w-1/2 animate-pulse rounded bg-[#242424]" />
        <div className="h-5 w-3/4 animate-pulse rounded bg-[#242424]" />
        <div className="h-6 w-1/3 animate-pulse rounded bg-[#242424]" />
        <div className="h-10 w-full animate-pulse rounded bg-[#242424]" />
      </div>
    </div>
  );
}

function CustomerStories({ stories }: { stories: CustomerStory[] }) {
  if (stories.length === 0) return null;

  return (
    <section aria-labelledby="historias-title" className="border-t border-[#242424] bg-[#151515]/40 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <SectionHeader eyebrow="Histórias reais" title="Quem veste a MV" testId="customer-stories-title" id="historias-title" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {stories.map((story) => (
            <article key={story.title} className="rounded-2xl border border-[#242424] bg-[#151515] p-6">
              <h3 className="font-heading text-lg font-bold text-white">{story.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#BDBDBD]">{story.summary}</p>
              {story.href && <a href={story.href} className="mt-5 inline-flex text-sm font-bold text-[#DAA520] hover:underline">Conhecer história</a>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Shop() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = searchParams.get("cat") ?? "";
  const query = searchParams.get("q") ?? "";
  const [draft, setDraft] = useState(query);

  // The header search writes ?q=… — mirror it into the inline field.
  useEffect(() => setDraft(query), [query]);

  const applyFilters = (next: { cat?: string; q?: string }) => {
    const params: Record<string, string> = {};
    const cat = next.cat !== undefined ? next.cat : activeCategory;
    const q = next.q !== undefined ? next.q : query;
    if (cat) params.cat = cat;
    if (q.trim()) params.q = q.trim();
    setSearchParams(params);
  };

  const productsQuery = useQuery({
    queryKey: ["catalog", "products"],
    queryFn: () => apiGet<Product[]>("/catalog/products"),
    retry: false,
  });
  const categoriesQuery = useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: () => apiGet<Category[]>("/catalog/categories"),
    retry: false,
  });

  useEffect(() => {
    if (location.hash) {
      document.querySelector(location.hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [location]);

  const products = productsQuery.data ?? EMPTY_PRODUCTS;
  const filtered = useMemo(() => {
    const needle = normalize(query);
    return products.filter((p) => {
      if (activeCategory && p.category_slug !== activeCategory) return false;
      if (!needle) return true;
      const haystack = normalize(
        `${p.name} ${p.brand} ${p.category_name} ${p.sku} ${p.description}`,
      );
      return needle.split(/\s+/).every((word) => haystack.includes(word));
    });
  }, [products, activeCategory, query]);
  const featured = useMemo(() => products.filter((p) => p.featured).slice(0, 4), [products]);
  const destaques = featured.length > 0 ? featured : products.slice(0, 4);
  const categories = categoriesQuery.data ?? FALLBACK_CATEGORIES;
  const activeCategoryName = categories.find((c) => c.slug === activeCategory)?.name;

  return (
    <div data-testid="shop-page" className="flex flex-col">
      {/* ---------------------------------------------------------- hero */}
      <section className="relative flex min-h-[82svh] items-center overflow-hidden">
        <img
          src={HERO_IMAGE}
          srcSet={HERO_IMAGE_SRCSET}
          sizes="100vw"
          alt="Modelos em streetwear premium"
          width={1920}
          height={1280}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-center"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 90% 35%, rgba(218,165,32,0.12), transparent 32%), linear-gradient(135deg, rgba(11,11,11,0.92) 0%, rgba(11,11,11,0.70) 50%, rgba(11,11,11,0.85) 100%)",
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative z-10 mx-auto w-full max-w-7xl px-4 py-20 sm:px-8"
        >
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#DAA520]/30 bg-[#0B0B0B]/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-[#DAA520]">
            <span className="h-2 w-2 rounded-full bg-[#DAA520] animate-glow-pulse" />
            MV Multimarcas
          </p>
          <h1 className="max-w-2xl font-heading text-4xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Vista sua <span className="text-[#DAA520]">presença.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-[#BDBDBD] sm:text-lg">
            Performance, atitude e acabamento premium para quem se move diferente.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              to="/#destaques"
              data-testid="hero-explore-btn"
              className={`${buttonVariants({ size: "lg" })} animate-glow-pulse bg-[#DAA520] font-bold uppercase tracking-wide text-[#0B0B0B] hover:bg-[#A07C1B]`}
            >
              Explorar destaques <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/#colecao"
              className="text-sm font-semibold uppercase tracking-wider text-white underline-offset-8 transition-colors hover:text-[#DAA520] hover:underline"
            >
              Ver coleção completa
            </Link>
          </div>
          <div className="mt-14 flex flex-wrap gap-x-8 gap-y-3 text-sm text-[#BDBDBD]">
            <span className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-[#DAA520]" /> Condições de entrega no checkout
            </span>
            <span className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-[#DAA520]" /> Consulte as condições de troca
            </span>
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#DAA520]" /> Compra segura
            </span>
          </div>
        </motion.div>
      </section>

      {/* ---------------------------------------------------------- marquee */}
      <div data-testid="shop-marquee" className="overflow-hidden border-y border-[#242424] bg-[#151515] py-3">
        <div className="animate-marquee flex w-max whitespace-nowrap">
          {[0, 1].map((i) => (
            <span
              key={i}
              className="text-sm font-bold uppercase tracking-[0.3em] text-[#DAA520]"
            >
              {MARQUEE_TEXT.repeat(2)}
            </span>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------- categorias */}
      <section id="categorias" className="render-section mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-16 sm:px-8">
        <SectionHeader eyebrow="Explore por estilo" title="Categorias" testId="shop-categories-title" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-6">
          {categories.map((cat, index) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: (index % 6) * 0.05, ease: "easeOut" }}
            >
              <CategoryCard name={cat.name} slug={cat.slug} imageFileId={cat.image_file_id} />
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- destaques */}
      <section id="destaques" className="render-section scroll-mt-24 border-y border-[#242424] bg-[#151515]/40 py-20">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-8">
          <SectionHeader eyebrow="Seleção Golden" title="Destaques" testId="shop-featured-title" />
          {productsQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <ProductSkeleton key={i} />
              ))}
            </div>
          ) : productsQuery.isError ? (
            <EmptyState
              testId="shop-products-error"
              icon={Zap}
              title="Catálogo indisponível no momento"
              description="Não foi possível carregar os produtos agora. A vitrine volta ao normal assim que o serviço responder."
              action={
                <Button variant="outline" onClick={() => productsQuery.refetch()} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Tentar novamente
                </Button>
              }
            />
          ) : destaques.length === 0 ? (
            <EmptyState
              testId="shop-featured-empty"
              icon={PackageSearch}
              title="Nenhum destaque por enquanto"
              description="Os produtos marcados como destaque pelo administrador aparecem nesta seção."
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {destaques.map((product, index) => (
                <ProductCard key={product.id} product={product} index={index} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------- coleção */}
      <section id="colecao" className="render-section mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-20 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeader eyebrow="Toda a vitrine" title="Coleção" testId="shop-catalog-title" />
          <div className="mb-8 flex flex-wrap items-center gap-2" data-testid="shop-category-filter">
            <button
              type="button"
              data-testid="shop-filter-all"
              onClick={() => applyFilters({ cat: "" })}
              className={`min-h-10 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                activeCategory === ""
                  ? "border-[#DAA520] bg-[#DAA520] text-[#0B0B0B]"
                  : "border-[#242424] bg-[#151515] text-[#BDBDBD] hover:border-[#DAA520] hover:text-[#DAA520]"
              }`}
            >
              Todas
            </button>
            {categories.map((cat) => (
              <button
                key={cat.slug}
                type="button"
                data-testid={`shop-filter-${cat.slug}`}
                onClick={() => applyFilters({ cat: cat.slug })}
                className={`min-h-10 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                  activeCategory === cat.slug
                    ? "border-[#DAA520] bg-[#DAA520] text-[#0B0B0B]"
                    : "border-[#242424] bg-[#151515] text-[#BDBDBD] hover:border-[#DAA520] hover:text-[#DAA520]"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* campo de busca da coleção */}
        <form
          role="search"
          data-testid="catalog-search-form"
          onSubmit={(event) => {
            event.preventDefault();
            applyFilters({ q: draft });
          }}
          className="relative mb-6 w-full max-w-xl"
        >
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#BDBDBD]" />
          <input
            data-testid="catalog-search-input"
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Buscar por peça, marca, categoria ou SKU…"
            aria-label="Buscar peças na coleção"
            className="h-12 w-full rounded-xl border border-[#242424] bg-[#151515] pl-10 pr-28 text-sm text-white placeholder:text-[#BDBDBD]/70 transition-colors focus:border-[#DAA520] focus:outline-none"
          />
          {draft && (
            <button
              type="button"
              data-testid="catalog-search-clear"
              aria-label="Limpar busca"
              onClick={() => {
                setDraft("");
                applyFilters({ q: "" });
              }}
              className="absolute right-[5.5rem] top-1/2 -translate-y-1/2 rounded p-1 text-[#BDBDBD] transition-colors hover:text-[#DAA520]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="submit"
            data-testid="catalog-search-submit"
            className="absolute right-1.5 top-1.5 h-9 rounded-lg bg-[#DAA520] px-4 text-xs font-bold uppercase tracking-wide text-[#0B0B0B] transition-colors hover:bg-[#A07C1B]"
          >
            Buscar
          </button>
        </form>

        {query && (
          <div
            data-testid="catalog-search-summary"
            className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-[#DAA520]/30 bg-[#1E1A08]/60 px-4 py-3"
          >
            <Search className="h-4 w-4 text-[#DAA520]" />
            <p className="text-sm text-white">
              <span data-testid="catalog-search-count" className="font-bold text-[#DAA520]">
                {filtered.length}
              </span>{" "}
              resultado(s) para “<span className="font-bold text-[#DAA520]">{query}</span>”
            </p>
            <button
              type="button"
              data-testid="catalog-search-reset"
              onClick={() => applyFilters({ q: "", cat: "" })}
              className="ml-auto text-xs font-bold uppercase tracking-wider text-[#BDBDBD] transition-colors hover:text-[#DAA520]"
            >
              Limpar busca
            </button>
          </div>
        )}

        {activeCategoryName && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-[#DAA520]/30 bg-[#1E1A08]/60 px-4 py-3">
            <Sparkles className="h-4 w-4 text-[#DAA520]" />
            <p className="text-sm text-white">
              Exibindo categoria: <span className="font-bold text-[#DAA520]">{activeCategoryName}</span>
            </p>
            <button
              type="button"
              data-testid="shop-filter-clear"
              onClick={() => applyFilters({ cat: "" })}
              className="ml-auto text-xs font-bold uppercase tracking-wider text-[#BDBDBD] transition-colors hover:text-[#DAA520]"
            >
              Limpar filtro
            </button>
          </div>
        )}

        {productsQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <ProductSkeleton key={i} />
            ))}
          </div>
        ) : productsQuery.isError ? (
          <EmptyState
            testId="shop-catalog-error"
            icon={Zap}
            title="Catálogo indisponível no momento"
            description="A vitrine volta ao normal assim que o serviço responder. Tente novamente em instantes."
            action={
              <Button variant="outline" onClick={() => productsQuery.refetch()} className="gap-2">
                <RefreshCw className="h-4 w-4" /> Tentar novamente
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            testId="shop-catalog-empty"
            icon={PackageSearch}
            title={query ? `Nada encontrado para “${query}”` : "Nenhum produto encontrado"}
            description={
              query
                ? "Tente outro termo — busque por peça, marca, categoria ou SKU."
                : "Ajuste o filtro de categoria ou volte para a coleção completa."
            }
            action={
              query || activeCategory ? (
                <Button
                  variant="outline"
                  data-testid="shop-catalog-empty-reset"
                  onClick={() => applyFilters({ q: "", cat: "" })}
                >
                  Ver a coleção completa
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {filtered.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="faq-title" className="render-section border-t border-[#242424] bg-[#0B0B0B] py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-8">
          <SectionHeader eyebrow="Dúvidas frequentes" title="Como funciona a compra" testId="faq-title" id="faq-title" />
          <div className="divide-y divide-[#242424] rounded-2xl border border-[#242424] bg-[#151515]">
            {FAQ_ITEMS.map(([question, answer]) => (
              <details key={question} className="group px-5 py-1">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-bold text-white marker:content-none focus-visible:outline-none focus-visible:text-[#DAA520]">
                  {question}
                  <span aria-hidden="true" className="text-xl text-[#DAA520] transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="max-w-2xl pb-4 text-sm leading-relaxed text-[#BDBDBD]">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <CustomerStories stories={CUSTOMER_STORIES} />

      {/* ---------------------------------------------------------- manifesto */}
      <section className="render-section border-t border-[#242424] bg-[#151515]/40 py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-8 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="relative overflow-hidden rounded-2xl border border-[#DAA520]/20"
          >
            <img
              src={EDITORIAL_IMAGE}
              srcSet={EDITORIAL_IMAGE_SRCSET}
              sizes="(min-width: 1024px) 50vw, 100vw"
              alt="Editorial MV Multimarcas"
              width={1200}
              height={800}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0B]/70 via-transparent to-transparent" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <SectionHeader eyebrow="Manifesto" title="Feito para quem se move diferente" testId="shop-manifesto-title" />
            <p className="text-base leading-relaxed text-[#BDBDBD]">
              A MV Multimarcas reúne streetwear e roupas esportivas em uma vitrine com navegação
              simples, filtros por categoria e detalhes de cada produto antes da compra.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-4">
              {[
                { value: "Coleção", label: "Peças organizadas por categoria" },
                { value: "Detalhes", label: "Informações no produto" },
                { value: "Carrinho", label: "Itens salvos neste navegador" },
              ].map((stat) => (
                <div key={stat.value} className="rounded-xl border border-[#242424] bg-[#0B0B0B] p-4">
                  <p className="font-heading text-xl font-black uppercase text-[#DAA520]">{stat.value}</p>
                  <p className="mt-1 text-xs text-[#BDBDBD]">{stat.label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
