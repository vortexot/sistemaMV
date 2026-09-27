# Hero cinematográfica

Implementada na página inicial usando o vídeo fornecido `Prospect_Elevator_4K_Natural_H264 - Trim.mp4`.

## Mídia

- `frontend/public/media/intro/elevator-v2.mp4`: H.264 High Level 4.1, 1920 × 1080, 24 fps, 150 frames, 6,25 segundos, sem áudio, faststart, 2.123.756 bytes (original: 10.763.133 bytes). O Level 4.1 amplia a compatibilidade com decodificadores móveis.
- `elevator-v2-final.webp`: WebP lossless extraído do frame 149 do MP4 distribuído, em 1920 × 1080. A pose final começa em 6,208333 segundos.
- `elevator-v2-poster.webp`: primeiro frame da mesma versão, usado durante o carregamento e como fallback.

O original permanece intacto. Nenhuma imagem foi gerada por IA. A codificação usa BT.709 e os arquivos de imagem vêm da decodificação do próprio MP4 otimizado.

## Comportamento

`INTRO_LOADING → INTRO_PLAYING → INTRO_ENDING → HERO_READY`.

A imagem final começa a decodificar em paralelo com o vídeo e a conclusão aguarda essa imagem antes de remover a mídia. O evento real `ended` pausa o vídeo; a imagem já está atrás dele, com a mesma classe de enquadramento. Dois frames de renderização permitem a troca sem fade entre poses diferentes. O vídeo sai do DOM e o fundo permanente passa a ser a imagem. Nenhum loop, reverse, seek ao início ou animação é aplicado ao personagem.

No celular, `autoplay`, `muted` e `playsinline` estão presentes desde o primeiro render e são reforçados no elemento antes de qualquer operação assíncrona. O autoplay declarativo tem prioridade; uma chamada `play()` atrasada só ocorre se o vídeo estiver carregado e ainda pausado. Assim, Safari recebe os atributos no momento exigido sem provocar uma segunda reprodução. Os nomes `v2` também evitam que o cache imutável reutilize o MP4 anterior.

O estado vive somente no módulo JavaScript do documento. Scroll, resize, orientação, filtros, âncoras e navegação interna não reiniciam a introdução. Refresh cria outro documento e permite a reprodução novamente.

Menu e conteúdo da Hero ficam `inert` durante a introdução, sem foco ou cliques. O overflow temporário é restaurado ao finalizar ou desmontar. Os CTAs e o menu aparecem em cascata; as âncoras iniciais só são atendidas depois de liberar a Hero.

No desktop, o texto ocupa a esquerda. Até 900 px, a cena começa abaixo do espaço do menu e o texto fica abaixo dela, preservando o personagem. Vídeo, poster e imagem final compartilham exatamente a mesma geometria em cada breakpoint.

Redução de movimento, rejeição de autoplay, erro ou ausência de progresso por 10 segundos levam ao estado estático. O watchdog serve apenas para falha; não determina o fim normal. A espera da imagem no fallback também é limitada, impedindo scroll permanentemente bloqueado. Se a imagem final falhar, permanece o poster.

## Verificação

`cd tests; npx playwright test e2e/hero-intro.spec.ts`

Os testes reproduzem o MP4 real em Chromium desktop/mobile e verificam um único evento `play` e um `ended`, igualdade de enquadramento, remoção do vídeo, scroll liberado, navegação interna sem replay e nova reprodução somente após refresh. A comparação do frame decodificado com o WebP registrou diferença média de 1,26 por canal em escala 0–255 (conversão YUV/RGB do navegador), sem deslocamento da composição.

Também são exercitados redução de movimento, autoplay bloqueado, erro de vídeo, erro da imagem e vídeo sem resposta. O teste de SEO foi atualizado porque a Hero antiga com `srcset` foi substituída pelo frame da introdução.

Validação em 26/09/2026: 12/12 testes específicos da Hero passaram. A regressão de 42 cenários registrou 40 aprovações e duas falhas do teste legado que focava o menu ainda durante a introdução. Esse teste passou a aguardar `HERO_READY`; os dois retestes (desktop/mobile) passaram, sem falha pendente. Build/TypeScript aprovados; lint sem erros, com os seis avisos preexistentes. Capturas revisadas em `.local/hero-review/desktop.png` e `.local/hero-review/mobile.png`.

A correção móvel foi publicada no projeto Vercel `mv-multimarcas-staging` em 26/09/2026 e está em `https://mv-multimarcas-staging.vercel.app`. O deployment de produção `dpl_BMmUjpPmz4zidiUStu8LQesiBezC` ficou `READY`. Na URL pública, `/` e `/login` responderam `200`, o proxy da API respondeu `200`, o MP4 respondeu `206 Partial Content` com `video/mp4`, byte ranges e cache imutável de um ano, e o fluxo principal mobile passou. Reprodução em Safari/iOS físico ainda depende da conferência no aparelho do usuário.
