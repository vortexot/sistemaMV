export const SITE_NAME = "MV Multimarcas";
export const SITE_DESCRIPTION =
  "Conheça a coleção de streetwear e roupas esportivas da MV Multimarcas.";

export const FAQ_ITEMS = [
  ["Como encontro uma peça?", "Use a busca ou filtre a coleção por categoria. Você também pode abrir a vista rápida para consultar detalhes do produto."],
  ["Como adiciono itens ao carrinho?", "Selecione “Adicionar” no card do produto. A vista rápida mostra as informações e opções cadastradas para cada peça."],
  ["Onde vejo o valor final?", "O carrinho mostra os itens e o subtotal. As condições de entrega e o total são apresentados antes da confirmação do pagamento."],
  ["Como acompanho meu pedido?", "Depois de entrar na conta, acesse “Minha conta” para ver o histórico e o status dos pedidos."],
  ["O que faço se o pagamento não estiver disponível?", "O checkout informa quando o provedor de pagamento estiver indisponível. Nesse caso, tente novamente mais tarde."],
] as const;

const envValue = (value: string | undefined) => value?.trim() || undefined;

export const businessInfo = {
  address: envValue(import.meta.env.VITE_BUSINESS_ADDRESS),
  telephone: envValue(import.meta.env.VITE_BUSINESS_TELEPHONE),
  openingHours: envValue(import.meta.env.VITE_BUSINESS_OPENING_HOURS),
  mapUrl: envValue(import.meta.env.VITE_BUSINESS_MAP_URL),
  latitude: envValue(import.meta.env.VITE_BUSINESS_LATITUDE),
  longitude: envValue(import.meta.env.VITE_BUSINESS_LONGITUDE),
};

export const hasBusinessInfo = Object.values(businessInfo).some(Boolean);
