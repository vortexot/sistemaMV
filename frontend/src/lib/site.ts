export const SITE_NAME = "MV Multimarcas";
export const SITE_DESCRIPTION =
  "Conheça a coleção de streetwear e roupas esportivas da MV Multimarcas.";

export const FAQ_ITEMS = [
  ["Como encontro uma peça específica?", "Use a busca por nome, marca ou SKU, ou filtre a coleção por categoria. A vista rápida reúne os detalhes cadastrados sem tirar você da Home."],
  ["Onde consulto tamanhos e cores?", "Abra a vista rápida do produto. Quando houver tamanhos ou cores cadastrados, eles aparecem nessa área antes de você adicionar a peça ao carrinho."],
  ["Como confirmo preço e disponibilidade?", "O preço atual, eventuais valores promocionais e a disponibilidade aparecem em cada produto. O carrinho apresenta os itens e o subtotal antes da etapa final."],
  ["Quando vejo as condições do pedido?", "O checkout apresenta as condições aplicáveis e o valor final antes de qualquer confirmação. Nenhuma condição adicional é presumida na vitrine."],
  ["Posso comprar online e retirar na loja?", "Sim. No checkout, selecione “Retirar na loja”, conclua o pagamento online e aguarde o aviso de que o pedido está pronto para retirada."],
  ["Como acompanho meu pedido?", "Depois de entrar na conta, acesse “Minha conta” para consultar o histórico e o status informado para cada pedido."],
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
