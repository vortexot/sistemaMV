import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { businessInfo, FAQ_ITEMS, hasBusinessInfo, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

interface RouteSeo {
  title: string;
  description: string;
  index: boolean;
}

const PUBLIC_ROUTES: Record<string, RouteSeo> = {
  "/": {
    title: "Streetwear e roupas esportivas | MV Multimarcas",
    description: SITE_DESCRIPTION,
    index: true,
  },
  "/carrinho": { title: "Carrinho | MV Multimarcas", description: "Revise os itens adicionados ao carrinho.", index: false },
  "/checkout": { title: "Finalizar compra | MV Multimarcas", description: "Revise o pedido antes de seguir para o pagamento.", index: false },
  "/pedido-confirmado": { title: "Pedido confirmado | MV Multimarcas", description: "Confirmação do pedido na MV Multimarcas.", index: false },
  "/login": { title: "Entrar ou criar conta | MV Multimarcas", description: "Acesse sua conta na MV Multimarcas.", index: false },
  "/dashboard": { title: "Minha conta | MV Multimarcas", description: "Consulte pedidos e favoritos da sua conta.", index: false },
};

const ADMIN_TITLES: Record<string, string> = {
  "/admin": "Painel administrativo",
  "/admin/produtos": "Produtos",
  "/admin/categorias": "Categorias",
  "/admin/midia-indoor": "Mídia Indoor",
  "/admin/midia-indoor/tv": "TV da loja",
  "/admin/banners": "Mídia Indoor",
  "/admin/pedidos": "Pedidos",
  "/admin/clientes": "Clientes",
  "/admin/estoque": "Estoque",
  "/admin/relatorios": "Relatórios",
};

function upsertMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function absoluteBaseUrl() {
  const configured = import.meta.env.VITE_SITE_URL?.trim();
  try {
    return new URL(configured || import.meta.env.BASE_URL, window.location.origin)
      .toString()
      .replace(/\/+$/, "");
  } catch {
    return new URL(import.meta.env.BASE_URL, window.location.origin)
      .toString()
      .replace(/\/+$/, "");
  }
}

function routeSeo(pathname: string): RouteSeo {
  const publicRoute = PUBLIC_ROUTES[pathname];
  if (publicRoute) return publicRoute;
  const adminTitle = ADMIN_TITLES[pathname];
  if (adminTitle) return { title: `${adminTitle} | ${SITE_NAME}`, description: `${adminTitle} da ${SITE_NAME}.`, index: false };
  return { title: `Página não encontrada | ${SITE_NAME}`, description: "A página solicitada não foi encontrada.", index: false };
}

function structuredData(baseUrl: string) {
  const store: Record<string, unknown> = {
    "@type": hasBusinessInfo ? "Store" : "OnlineStore",
    "@id": `${baseUrl}/#store`,
    name: SITE_NAME,
    url: `${baseUrl}/`,
    logo: `${baseUrl}/mv-logo.jpg`,
  };

  if (businessInfo.address) store.address = businessInfo.address;
  if (businessInfo.telephone) store.telephone = businessInfo.telephone;
  if (businessInfo.openingHours) store.openingHours = businessInfo.openingHours.split(";").map((value) => value.trim()).filter(Boolean);
  if (businessInfo.mapUrl) store.hasMap = businessInfo.mapUrl;
  if (businessInfo.latitude && businessInfo.longitude) {
    store.geo = { "@type": "GeoCoordinates", latitude: businessInfo.latitude, longitude: businessInfo.longitude };
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      store,
      {
        "@type": "WebSite",
        "@id": `${baseUrl}/#website`,
        name: SITE_NAME,
        url: `${baseUrl}/`,
        potentialAction: {
          "@type": "SearchAction",
          target: `${baseUrl}/?q={search_term_string}#colecao`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ_ITEMS.map(([question, answer]) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
    ],
  };
}

export default function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    const seo = routeSeo(location.pathname);
    const baseUrl = absoluteBaseUrl();
    const canonicalPath = location.pathname === "/" ? "/" : location.pathname;
    const canonicalUrl = new URL(canonicalPath.replace(/^\/+/, ""), `${baseUrl}/`).toString();
    const imageUrl = new URL("mv-logo.jpg", `${baseUrl}/`).toString();

    document.title = seo.title;
    upsertMeta("name", "description", seo.description);
    upsertMeta("name", "robots", seo.index ? "index, follow, max-image-preview:large" : "noindex, nofollow");
    upsertMeta("property", "og:locale", "pt_BR");
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:site_name", SITE_NAME);
    upsertMeta("property", "og:title", seo.title);
    upsertMeta("property", "og:description", seo.description);
    upsertMeta("property", "og:image", imageUrl);
    upsertMeta("property", "og:image:width", "150");
    upsertMeta("property", "og:image:height", "150");
    upsertMeta("property", "og:url", canonicalUrl);
    upsertMeta("name", "twitter:card", "summary");
    upsertMeta("name", "twitter:title", seo.title);
    upsertMeta("name", "twitter:description", seo.description);
    upsertMeta("name", "twitter:image", imageUrl);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    const schemaId = "mv-structured-data";
    let schema = document.getElementById(schemaId) as HTMLScriptElement | null;
    if (seo.index) {
      if (!schema) {
        schema = document.createElement("script");
        schema.id = schemaId;
        schema.type = "application/ld+json";
        document.head.appendChild(schema);
      }
      schema.textContent = JSON.stringify(structuredData(baseUrl));
    } else {
      schema?.remove();
    }
  }, [location.pathname]);

  return null;
}
