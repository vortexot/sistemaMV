import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  Eye,
  ListChecks,
  PackageSearch,
  ReceiptText,
  RefreshCw,
  Search,
  Store,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

import { apiGet } from "@/lib/api";
import type { CatalogCategory, CatalogProduct } from "@/lib/types";
import { Button } from "@/components/ui/button";
import ProductCard from "@/components/shop/ProductCard";
import ProductImage from "@/components/shop/ProductImage";
import ProductQuickView from "@/components/shop/ProductQuickView";
import EmptyState from "@/components/shop/EmptyState";
import CinematicHero from "@/components/shop/CinematicHero";
import { FAQ_ITEMS } from "@/lib/site";
import { brl } from "@/lib/format";
import { cartUnitPrice } from "@/lib/cart";
import { catalogFileUrl, publicAsset } from "@/lib/assets";
import { useHeroPhase } from "@/lib/heroIntro";
import "./shop-editorial.css";

const EDITORIAL_IMAGE = publicAsset("media/editorial-1200.webp");
const EDITORIAL_IMAGE_SRCSET = [480, 768, 960, 1200]
  .map((width) => `${publicAsset(`media/editorial-${width}.webp`)} ${width}w`)
  .join(", ");
const BRAND_IMAGE = publicAsset("media/hero-1920.webp");
const BRAND_IMAGE_SRCSET = [640, 960, 1280, 1600, 1920]
  .map((width) => `${publicAsset(`media/hero-${width}.webp`)} ${width}w`)
  .join(", ");

const MARQUEE_TEXT = "MV MULTIMARCAS • PRESENÇA • MOVIMENTO • STREETWEAR • ";
const EMPTY_PRODUCTS: CatalogProduct[] = [];

const FALLBACK_CATEGORIES = [
  { id: "camisas", name: "Camisas", slug: "camisas", description: "", image_file_id: null },
  { id: "moletons", name: "Moletons", slug: "moletons", description: "", image_file_id: null },
  { id: "tenis", name: "Tênis", slug: "tenis", description: "", image_file_id: null },
  { id: "calcas", name: "Calças", slug: "calcas", description: "", image_file_id: null },
  { id: "shorts", name: "Shorts", slug: "shorts", description: "", image_file_id: null },
  { id: "acessorios", name: "Acessórios", slug: "acessorios", description: "", image_file_id: null },
] as CatalogCategory[];

const CATEGORY_LAYOUT = [
  "lg:col-span-6 lg:row-span-2",
  "lg:col-span-2",
  "lg:col-span-2",
  "lg:col-span-2",
  "lg:col-span-3",
  "lg:col-span-3",
];

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function SectionHeader({
  eyebrow,
  title,
  testId,
  id,
  tone = "dark",
  copy,
}: {
  eyebrow: string;
  title: string;
  testId: string;
  id?: string;
  tone?: "dark" | "light";
  copy?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="editorial-heading"
    >
      <p className={tone === "light" ? "editorial-eyebrow text-[#735A23]" : "editorial-eyebrow text-[#D7B775]"}>{eyebrow}</p>
      <h2 id={id} data-testid={testId} className={`editorial-title ${tone === "light" ? "text-[#171612]" : "text-[#F4F0E8]"}`}>{title}</h2>
      {copy && <p className={tone === "light" ? "editorial-copy text-[#504B42]" : "editorial-copy text-[#AAA69D]"}>{copy}</p>}
    </motion.div>
  );
}

function CategoryCard({ category, index }: { category: CatalogCategory; index: number }) {
  return (
    <Link to={`/?cat=${category.slug}#colecao`} data-testid={`category-card-${category.slug}`} className="editorial-category group">
      {category.image_file_id ? (
        <img src={catalogFileUrl(category.image_file_id)} alt="" width={900} height={700} loading="lazy" decoding="async" className="editorial-category-image" />
      ) : (
        <div className="editorial-category-fallback" aria-hidden="true">{category.name.slice(0, 1)}</div>
      )}
      <div className="editorial-category-shade" />
      <span className="editorial-category-index" aria-hidden="true">0{index + 1}</span>
      <div className="editorial-category-content">
        <div><p>Explorar</p><h3>{category.name}</h3></div>
        <span className="editorial-category-arrow" aria-hidden="true"><ArrowUpRight /></span>
      </div>
    </Link>
  );
}

function ProductSkeleton({ editorial = false }: { editorial?: boolean }) {
  return (
    <div className={`overflow-hidden border border-[#2A2824] bg-[#151515] ${editorial ? "min-h-72" : "rounded-xl"}`}>
      <div className="aspect-[4/4.65] animate-pulse bg-[#2A2824]/70" />
      <div className="space-y-3 p-4"><div className="h-3 w-1/2 animate-pulse rounded bg-[#2A2824]" /><div className="h-5 w-3/4 animate-pulse rounded bg-[#2A2824]" /><div className="h-6 w-1/3 animate-pulse rounded bg-[#2A2824]" /></div>
    </div>
  );
}

function ManifestoSection() {
  const reduceMotion = useReducedMotion();
  return (
    <section className="render-section manifesto-section" aria-labelledby="manifesto-title">
      <div className="manifesto-grid">
        <motion.div initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="manifesto-image-wrap">
          <img src={EDITORIAL_IMAGE} srcSet={EDITORIAL_IMAGE_SRCSET} sizes="(min-width: 1024px) 50vw, 100vw" alt="Editorial MV Multimarcas" width={1200} height={800} loading="lazy" decoding="async" className="manifesto-image" />
          <span className="manifesto-image-label">MV / 2026</span>
        </motion.div>
        <div className="manifesto-content">
          <SectionHeader eyebrow="Manifesto" title="Antes da tendência, atitude." testId="shop-manifesto-title" id="manifesto-title" tone="light" />
          <p className="manifesto-statement">A MV nasce no encontro entre rua, movimento e intenção. Selecionamos peças para quem usa o que veste como extensão da própria postura.</p>
          <p className="manifesto-signature">Sem excesso. Sem personagem. Só presença.</p>
          <div className="manifesto-values" aria-label="Valores da marca"><span>Rua</span><span>Movimento</span><span>Presença</span></div>
        </div>
      </div>
    </section>
  );
}

function LookbookProduct({ product, featured = false }: { product: CatalogProduct; featured?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={featured ? "lookbook-item lookbook-item-main" : "lookbook-item"}>
      <button type="button" onClick={() => setOpen(true)} className="lookbook-image-button" aria-label={`Ver detalhes de ${product.name}`}>
        <ProductImage fileId={product.image_file_id} name={product.name} productId={`look-${product.id}`} className="lookbook-image" />
        <span className="lookbook-view"><Eye aria-hidden="true" /> Ver peça</span>
      </button>
      <div className="lookbook-meta"><div><p>{product.category_name}</p><h3>{product.name}</h3></div><strong>{brl(cartUnitPrice(product))}</strong></div>
      <ProductQuickView product={product} open={open} onOpenChange={setOpen} />
    </article>
  );
}

function CompleteTheLook({ products }: { products: CatalogProduct[] }) {
  if (products.length < 2) return null;
  return (
    <section className="render-section lookbook-section" aria-labelledby="lookbook-title">
      <div className="lookbook-shell">
        <div className="lookbook-intro">
          <SectionHeader eyebrow="Curadoria MV" title="Complete o look" testId="shop-lookbook-title" id="lookbook-title" tone="light" copy="Uma leitura editorial com peças reais da coleção. Abra cada item para consultar os detalhes cadastrados." />
          <Link to="/#colecao" className="lookbook-link">Explorar coleção <ArrowRight aria-hidden="true" /></Link>
        </div>
        <div className="lookbook-products">{products.map((product, index) => <LookbookProduct key={product.id} product={product} featured={index === 0} />)}</div>
      </div>
    </section>
  );
}

function TrustSection() {
  const items = [
    { icon: ListChecks, title: "Informação clara", text: "Preço, disponibilidade e variações cadastradas antes de adicionar." },
    { icon: ReceiptText, title: "Total visível", text: "Itens e subtotal ficam disponíveis no carrinho antes da confirmação." },
    { icon: PackageSearch, title: "Acompanhamento", text: "Histórico e status dos pedidos ficam reunidos na área da conta." },
    { icon: Store, title: "Você escolhe", text: "Compre online e escolha entre receber em casa ou retirar na loja." },
  ];
  return (
    <section className="render-section trust-section" aria-labelledby="trust-title">
      <div className="trust-shell">
        <div className="trust-lead"><p className="editorial-eyebrow text-[#D7B775]">Da escolha ao pedido</p><h2 id="trust-title">Clareza em cada etapa.</h2></div>
        <div className="trust-grid">{items.map(({ icon: Icon, title, text }, index) => <article key={title} className="trust-item"><span className="trust-number">0{index + 1}</span><Icon aria-hidden="true" /><h3>{title}</h3><p>{text}</p></article>)}</div>
      </div>
    </section>
  );
}

function BrandMoment() {
  return (
    <section className="render-section brand-moment" aria-label="Momento editorial MV Multimarcas">
      <img src={BRAND_IMAGE} srcSet={BRAND_IMAGE_SRCSET} sizes="100vw" alt="" width={1920} height={1080} loading="lazy" decoding="async" />
      <div className="brand-moment-shade" />
      <div className="brand-moment-copy"><p>MV / Multimarcas</p><h2>O estilo chega antes das palavras.</h2><Link to="/#colecao">Encontrar minha próxima peça <ArrowRight aria-hidden="true" /></Link></div>
    </section>
  );
}

export default function Shop() {
  const heroPhase = useHeroPhase();
  const reduceMotion = useReducedMotion();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = searchParams.get("cat") ?? "";
  const query = searchParams.get("q") ?? "";
  const [draft, setDraft] = useState(query);
  const [pageSize, setPageSize] = useState(8);
  const [visibleCount, setVisibleCount] = useState(8);

  useEffect(() => setDraft(query), [query]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setPageSize(media.matches ? 6 : 8);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => setVisibleCount(pageSize), [activeCategory, query, pageSize]);

  const applyFilters = (next: { cat?: string; q?: string }) => {
    const params: Record<string, string> = {};
    const cat = next.cat !== undefined ? next.cat : activeCategory;
    const q = next.q !== undefined ? next.q : query;
    if (cat) params.cat = cat;
    if (q.trim()) params.q = q.trim();
    setSearchParams(params);
  };

  const productsQuery = useQuery({ queryKey: ["catalog", "products"], queryFn: () => apiGet<CatalogProduct[]>("/catalog/products"), retry: false });
  const categoriesQuery = useQuery({ queryKey: ["catalog", "categories"], queryFn: () => apiGet<CatalogCategory[]>("/catalog/categories"), retry: false });

  useEffect(() => {
    if (!location.hash || heroPhase !== "HERO_READY") return;

    const target = document.querySelector(location.hash);
    if (!target) return;

    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    // Chromium can finish a long smooth scroll before the requested anchor when
    // the page is still decoding lazy media. Correct the final position after
    // layout settles so Hero CTAs and menu links always reach their section.
    const settle = () => document.querySelector(location.hash)?.scrollIntoView({ behavior: "auto", block: "start" });
    const firstCorrection = window.setTimeout(settle, 900);
    const finalCorrection = window.setTimeout(settle, 1_800);
    return () => {
      window.clearTimeout(firstCorrection);
      window.clearTimeout(finalCorrection);
    };
  }, [location.hash, heroPhase, reduceMotion]);

  const products = productsQuery.data ?? EMPTY_PRODUCTS;
  const filtered = useMemo(() => {
    const needle = normalize(query);
    return products.filter((product) => {
      if (activeCategory && product.category_slug !== activeCategory) return false;
      if (!needle) return true;
      const haystack = normalize(`${product.name} ${product.brand} ${product.category_name} ${product.sku} ${product.description}`);
      return needle.split(/\s+/).every((word) => haystack.includes(word));
    });
  }, [products, activeCategory, query]);
  const destaques = useMemo(() => {
    const featured = products.filter((product) => product.featured);
    return (featured.length > 0 ? featured : products).slice(0, 3);
  }, [products]);
  const highlightedIds = useMemo(() => new Set(destaques.map((product) => product.id)), [destaques]);
  const collectionProducts = useMemo(() => activeCategory || query ? filtered : filtered.filter((product) => !highlightedIds.has(product.id)), [activeCategory, filtered, highlightedIds, query]);
  const visibleProducts = collectionProducts.slice(0, visibleCount);
  const lookProducts = useMemo(() => {
    const preferred = products.filter((product) => product.in_stock && !highlightedIds.has(product.id));
    const pool = preferred.length >= 3 ? preferred : products.filter((product) => product.in_stock);
    const unique: CatalogProduct[] = [];
    for (const product of pool) {
      if (!unique.some((item) => item.category_slug === product.category_slug)) unique.push(product);
      if (unique.length === 3) break;
    }
    for (const product of pool) {
      if (!unique.some((item) => item.id === product.id)) unique.push(product);
      if (unique.length === 3) break;
    }
    return unique;
  }, [highlightedIds, products]);
  const categories = categoriesQuery.data ?? FALLBACK_CATEGORIES;
  const activeCategoryName = categories.find((category) => category.slug === activeCategory)?.name;
  const hasMore = visibleCount < collectionProducts.length;

  return (
    <div data-testid="shop-page" className="editorial-home flex flex-col">
      <CinematicHero />

      <div data-testid="shop-marquee" className="hero-bridge" aria-hidden="true"><div className="animate-marquee flex w-max whitespace-nowrap">{[0, 1].map((index) => <span key={index}>{MARQUEE_TEXT.repeat(2)}</span>)}</div></div>

      <section id="categorias" className="render-section editorial-categories scroll-mt-24">
        <div className="editorial-shell">
          <SectionHeader eyebrow="Explore por estilo" title="Encontre sua direção." testId="shop-categories-title" copy="Seis entradas para a mesma ideia: vestir presença sem pedir licença." />
          <div className="category-editorial-grid">
            {categories.map((category, index) => (
              <motion.div key={category.id} initial={reduceMotion ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.5, delay: Math.min(index, 5) * 0.045 }} className={`min-h-40 sm:min-h-52 ${categories.length >= 6 ? CATEGORY_LAYOUT[index] ?? "lg:col-span-3" : "lg:col-span-4"}`}>
                <CategoryCard category={category} index={index} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <ManifestoSection />

      <section id="destaques" className="render-section featured-editorial scroll-mt-24">
        <div className="editorial-shell">
          <div className="featured-heading-row"><SectionHeader eyebrow="Seleção Golden" title="Peças que conduzem a cena." testId="shop-featured-title" copy="Uma peça assume o centro. As outras completam a narrativa." /><Link to="/#colecao" className="editorial-text-link">Ver coleção <ArrowRight aria-hidden="true" /></Link></div>
          {productsQuery.isLoading ? (
            <div className="featured-products-grid">{[0, 1, 2].map((index) => <ProductSkeleton key={index} editorial />)}</div>
          ) : productsQuery.isError ? (
            <EmptyState testId="shop-products-error" icon={Zap} title="Catálogo indisponível no momento" description="Não foi possível carregar os produtos agora. A vitrine volta ao normal assim que o serviço responder." action={<Button variant="outline" onClick={() => productsQuery.refetch()} className="gap-2"><RefreshCw className="h-4 w-4" /> Tentar novamente</Button>} />
          ) : destaques.length === 0 ? (
            <EmptyState testId="shop-featured-empty" icon={PackageSearch} title="Nenhum destaque por enquanto" description="Os produtos marcados como destaque pelo administrador aparecem nesta seção." />
          ) : (
            <div className="featured-products-grid">{destaques.map((product, index) => <ProductCard key={product.id} product={product} index={index} variant={index === 0 ? "feature-main" : "feature-side"} className={index === 0 ? "featured-main" : "featured-side"} />)}</div>
          )}
        </div>
      </section>

      <section id="colecao" className="render-section collection-editorial scroll-mt-24">
        <div className="editorial-shell">
          <div className="collection-heading-row"><SectionHeader eyebrow="Toda a vitrine" title="Coleção" testId="shop-catalog-title" copy="Descubra em etapas. Filtre, pesquise e carregue mais quando quiser continuar." /><div className="collection-count" aria-live="polite"><strong>{collectionProducts.length}</strong><span>peças nesta seleção</span></div></div>

          <div className="collection-tools">
            <div className="collection-filters" role="group" data-testid="shop-category-filter" aria-label="Filtrar coleção por categoria">
              <button type="button" data-testid="shop-filter-all" onClick={() => applyFilters({ cat: "" })} aria-pressed={activeCategory === ""} className={activeCategory === "" ? "active" : ""}>Todas</button>
              {categories.map((category) => <button key={category.slug} type="button" data-testid={`shop-filter-${category.slug}`} onClick={() => applyFilters({ cat: category.slug })} aria-pressed={activeCategory === category.slug} className={activeCategory === category.slug ? "active" : ""}>{category.name}</button>)}
            </div>
            <form role="search" data-testid="catalog-search-form" onSubmit={(event) => { event.preventDefault(); applyFilters({ q: draft }); }} className="collection-search">
              <Search aria-hidden="true" /><input data-testid="catalog-search-input" type="search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Buscar peça, marca ou SKU" aria-label="Buscar peças na coleção" />
              {draft && <button type="button" data-testid="catalog-search-clear" aria-label="Limpar busca" onClick={() => { setDraft(""); applyFilters({ q: "" }); }}><X /></button>}
              <button type="submit" data-testid="catalog-search-submit">Buscar</button>
            </form>
          </div>

          {(query || activeCategoryName) && <div data-testid={query ? "catalog-search-summary" : undefined} className="collection-summary"><Sparkles aria-hidden="true" /><p>{query ? <><span data-testid="catalog-search-count">{collectionProducts.length}</span> resultado(s) para “<strong>{query}</strong>”</> : <>Exibindo categoria: <strong>{activeCategoryName}</strong></>}</p><button type="button" data-testid={query ? "catalog-search-reset" : "shop-filter-clear"} onClick={() => applyFilters({ q: "", cat: "" })}>Limpar seleção</button></div>}

          {productsQuery.isLoading ? (
            <div className="catalog-product-grid">{[0, 1, 2, 3, 4, 5, 6, 7].map((index) => <ProductSkeleton key={index} />)}</div>
          ) : productsQuery.isError ? (
            <EmptyState testId="shop-catalog-error" icon={Zap} title="Catálogo indisponível no momento" description="A vitrine volta ao normal assim que o serviço responder. Tente novamente em instantes." action={<Button variant="outline" onClick={() => productsQuery.refetch()} className="gap-2"><RefreshCw className="h-4 w-4" /> Tentar novamente</Button>} />
          ) : collectionProducts.length === 0 ? (
            <EmptyState testId="shop-catalog-empty" icon={PackageSearch} title={!query && !activeCategory && destaques.length > 0 ? "A seleção atual está nos destaques" : query ? `Nada encontrado para “${query}”` : "Nenhum produto encontrado"} description={!query && !activeCategory && destaques.length > 0 ? "Use uma categoria ou a busca para consultar novamente essas peças na coleção." : "Ajuste os filtros ou volte para a coleção completa."} action={query || activeCategory ? <Button variant="outline" data-testid="shop-catalog-empty-reset" onClick={() => applyFilters({ q: "", cat: "" })}>Ver a coleção completa</Button> : undefined} />
          ) : (
            <><motion.div layout className="catalog-product-grid">{visibleProducts.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</motion.div>{hasMore && <div className="load-more-wrap"><p>Você viu {visibleProducts.length} de {collectionProducts.length} peças.</p><button type="button" data-testid="shop-load-more" onClick={() => setVisibleCount((count) => Math.min(count + pageSize, collectionProducts.length))}>Carregar mais <ArrowRight aria-hidden="true" /></button></div>}</>
          )}
        </div>
      </section>

      <CompleteTheLook products={lookProducts} />
      <TrustSection />
      <BrandMoment />

      <section aria-labelledby="faq-title" className="render-section faq-editorial">
        <div className="faq-shell">
          <div className="faq-intro"><SectionHeader eyebrow="Antes de escolher" title="Dúvidas importantes" testId="faq-title" id="faq-title" copy="Respostas diretas para continuar a compra com contexto." /></div>
          <div className="faq-list">{FAQ_ITEMS.map(([question, answer], index) => <details key={question} className="group"><summary><span className="faq-index">0{index + 1}</span><span>{question}</span><span aria-hidden="true" className="faq-plus">+</span></summary><p>{answer}</p></details>)}</div>
        </div>
      </section>
    </div>
  );
}
