/* ===========================================================================
   WsCamada.tsx — componente React que embute uma camada 3D da White Stone.

   É o único ponto de contato entre a aplicação e o mundo Three.js.
   Nenhum outro arquivo do front precisa saber que existe 3D aqui dentro.

   Uso:

     <WsCamada
       camada="walkthrough"
       imovel={imovel}
       midia={{ splat: url, colisor: urlColisor }}
       aoReceberLead={lead => salvarLead(lead)}
       aoSalvarProjeto={space => salvarSpace(imovel.id, space)}
       aoNavegar={destino => router.push(rotaDe(destino))}
     />
   =========================================================================== */

import { useEffect, useRef, useState, useCallback } from 'react';
import { WsBridge } from './ws-bridge';

export type Camada =
  | 'mundo' | 'studio' | 'atelier' | 'tour' | 'walkthrough';

/** Nome do arquivo publicado de cada camada. O pacote gerado por
 *  `npm run publicar` é plano — as camadas ficam lado a lado na raiz. */
const ARQUIVO: Record<Camada, string> = {
  mundo:       'WS_MUNDO.html',
  studio:      'WS_STUDIO.html',
  atelier:     'WS_ATELIER.html',
  tour:        'WS_REAL.html',
  walkthrough: 'WS_MINT.html',
};

/**
 * Origem onde as camadas estão publicadas. Em produção, um subdomínio próprio —
 * ver o documento de auditoria, seção "isolamento de origem".
 *
 * Isto é uma constante, e não uma prop com valor padrão, de propósito: `origem`
 * e o `src` do iframe PRECISAM apontar para o mesmo lugar. Quando eram duas
 * coisas independentes — `src` relativo e `origem` = window.location.origin —
 * mudar as camadas de subdomínio quebrava a validação de origem em silêncio:
 * o iframe carregava, as mensagens iam para a origem errada, e a camada ficava
 * eternamente "carregando" sem nenhum erro no console.
 */
export const ORIGEM_CAMADAS: string =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_ORIGEM_CAMADAS) ||
  (typeof window !== 'undefined' ? window.location.origin : '');

const urlDaCamada = (c: Camada, base: string) =>
  `${base.replace(/\/$/, '')}/${ARQUIVO[c]}`;

export interface Imovel {
  id: string; nome: string; endereco?: string;
  lat?: number; lon?: number;
  area?: number; quartos?: number; suites?: number; vagas?: number;
  preco?: number; wsi?: number; status?: string;
}

export interface AmbienteMidia {
  id: string; nome?: string;
  /** .rad paginado, .splat ou .ply */
  splat: string;
  /** GLB invisível. Sem ele a camada desliga a medição — não a estima. */
  colisor?: string;
  capa?: string; bytes?: number;
  /** true = ambiente gerado por IA. Nunca para representar imóvel real à venda. */
  gerado?: boolean;
  cal?: { rotY?: number; escala?: number; y?: number };
}

export interface Midia {
  /** atalho de ambiente único */
  splat?: string; colisor?: string;
  /** vários cômodos ligados por passagens — tem precedência sobre splat/colisor */
  ambientes?: AmbienteMidia[];
  panoramas?: string[]; fotos?: string[];
}

/**
 * Sessão do visitante: onde parou e quanto tempo de atenção ATIVA deu a cada
 * cômodo. Os segundos já descontam aba oculta e ociosidade acima de 45 s — é
 * isso que os torna comparáveis entre imóveis.
 */
export interface WalkthroughSessao {
  imovelId: string | null;
  ambienteId: string | null;
  camera: { x: number; y: number; z: number; yaw: number; pitch: number; orbita: boolean };
  /** segundos por NOME de cômodo — { "Sala": 88 } */
  atencao: Record<string, number>;
  /** o mesmo, por id — estável à renomeação */
  atencaoPorId: Record<string, number>;
  tempoTotalS: number;
  carrinho: { sku: string; nome: string; preco: number }[];
}

/** Autoria do tour: como os cômodos se ligam e onde estão os pinos de móvel. */
export interface WalkthroughModelo {
  v: number;
  ambientes: { id: string; nome?: string; gerado?: boolean; crop?: number; cal?: unknown }[];
  passagens: { de: string; para: string | null; x: number; y: number; z: number }[];
  pinos: { ambiente: string; x: number; y: number; z: number;
           movel: { sku: string; nome: string; preco: number } }[];
}

export interface Lead {
  nome: string; telefone: string; email: string | null;
  intencao: string; projeto: string; wsi: number | null;
  area: number; comodos: number;
  tempo_no_tour_s: number;
  atencao: Record<string, number>;
  carrinho: { item: string; preco: number }[];
  valor_carrinho: number;
  quando: string;
}

/**
 * O que a aplicação pode PEDIR à camada num momento que ela escolhe.
 *
 * Existe por causa de uma ordem que o ciclo de vida do React não permite
 * expressar: fechar a experiência sem perder o último trecho de atenção. Chame
 * `pedirSessao()` no handler que fecha e desmonte no quadro seguinte.
 */
export interface WsCamadaControle {
  /** Faz a camada fechar o trecho em curso e emitir `ws:walkthrough-sessao`. */
  pedirSessao: () => void;
  /** Faz a camada emitir `ws:walkthrough-modelo` sem esperar o debounce. */
  pedirModelo: () => void;
}

interface Props {
  camada: Camada;
  imovel?: Imovel;
  space?: unknown;
  midia?: Midia;
  /** Modelo autoral do walkthrough gravado antes — restaura passagens e pinos. */
  walkthrough?: WalkthroughModelo | null;
  /** Origem onde a camada está publicada. O `src` do iframe sai daqui também. */
  origem?: string;
  aoReceberLead?: (lead: Lead) => void;
  aoSalvarProjeto?: (space: unknown, imovelId: string) => void;
  /** Autoria do tour mudou: passagens, pinos ou calibração. Persistir. */
  aoSalvarWalkthrough?: (modelo: WalkthroughModelo, imovelId: string | null) => void;
  /** Atenção por cômodo e posição da câmera. Chega a cada ~15 s e ao sair. */
  aoMedirSessao?: (sessao: WalkthroughSessao) => void;
  /** Controle imperativo — ver `WsCamadaControle`. */
  controle?: React.MutableRefObject<WsCamadaControle | null>;
  aoMudarCarrinho?: (itens: { sku: string; nome: string; preco: number }[]) => void;
  aoNavegar?: (destino: string, dados?: unknown) => void;
  aoErro?: (erro: Error) => void;
  className?: string;
}

export function WsCamada({
  camada, imovel, space, midia, walkthrough,
  origem = ORIGEM_CAMADAS,
  aoReceberLead, aoSalvarProjeto, aoSalvarWalkthrough, aoMedirSessao,
  aoMudarCarrinho, aoNavegar, aoErro,
  controle, className,
}: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<WsBridge | null>(null);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const tratarErro = useCallback((e: Error) => {
    setErro(e.message);
    aoErro?.(e);
  }, [aoErro]);

  useEffect(() => {
    if (!ref.current) return;

    const b = new WsBridge(ref.current, { origem, aoErro: tratarErro });
    bridgeRef.current = b;

    const inscricoes = [
      b.em('ws:pronto', () => setPronto(true)),

      b.em('ws:lead', (m: any) => aoReceberLead?.(m.lead)),

      b.em('ws:space-model', (m: any) =>
        aoSalvarProjeto?.(m.space, m.imovelId)),

      /* autoria do walkthrough — chega já com debounce de 1,5 s da camada */
      b.em('ws:walkthrough-modelo', (m: any) =>
        aoSalvarWalkthrough?.(m.modelo, m.imovelId ?? null)),

      /* atenção por cômodo e posição da câmera — a cada ~15 s e ao sair */
      b.em('ws:walkthrough-sessao', (m: any) => aoMedirSessao?.({
        imovelId: m.imovelId ?? null,
        ambienteId: m.ambienteId ?? null,
        camera: m.camera,
        atencao: m.atencao ?? {},
        atencaoPorId: m.atencaoPorId ?? {},
        tempoTotalS: m.tempoTotalS ?? 0,
        carrinho: m.carrinho ?? [],
      })),

      b.em('ws:carrinho', (m: any) => aoMudarCarrinho?.(m.itens)),

      /* navegação — a aplicação decide a rota, a camada só pede */
      ...(['ws:voltar-mundo', 'ws:ir-para-mundo', 'ws:ir-para-studio',
           'ws:abrir-atelier', 'ws:camada-real',
           'ws:entrar-imovel', 'ws:entrar-walkthrough'] as const)
        .map(t => b.em(t, (m: any) => aoNavegar?.(t, m))),
    ];

    /* Pedir a sessão AQUI, no cleanup, não funciona — e é uma armadilha
       convidativa. O React roda o cleanup antes de remover o nó do DOM, então
       `b.destruir()` já tirou o ouvinte quando a resposta da camada chegaria.
       O pedido sairia e a resposta cairia no vazio.

       Quem controla o momento é a aplicação: chame `controle.pedirSessao()` no
       handler que FECHA a experiência, e desmonte no quadro seguinte. */
    return () => { inscricoes.forEach(cancelar => cancelar()); b.destruir(); };
  }, [camada, origem, tratarErro, aoReceberLead, aoSalvarProjeto,
      aoSalvarWalkthrough, aoMedirSessao, aoMudarCarrinho, aoNavegar]);

  /* Controle imperativo para o que depende de ordem: fechar a experiência sem
     perder o último trecho de atenção medida. */
  useEffect(() => {
    if (!controle) return;
    controle.current = {
      pedirSessao: () => bridgeRef.current?.enviar('ws:pedir-sessao'),
      pedirModelo: () => bridgeRef.current?.enviar('ws:pedir-walkthrough'),
    };
    return () => { controle.current = null; };
  }, [controle]);

  /* injeta o imóvel assim que houver dado — o bridge enfileira se preciso */
  useEffect(() => {
    if (!imovel) return;
    bridgeRef.current?.enviar('ws:carregar-imovel', { imovel, space, midia, walkthrough });
  }, [imovel, space, midia, walkthrough, pronto]);

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <iframe
        ref={ref}
        src={urlDaCamada(camada, origem)}
        /* A `key` força o React a destruir e recriar o iframe quando a camada
           muda, em vez de reaproveitar o elemento trocando o src. Reaproveitar
           mantinha o contexto WebGL anterior vivo — e o navegador descarta o
           contexto mais antigo sem avisar, o que devolve a camada em tela preta. */
        key={`${camada}@${origem}`}
        title={`White Stone — camada ${camada}`}
        /* WebGL, ponteiro travado e tela cheia. Sem isso o 3D não funciona. */
        allow="fullscreen; xr-spatial-tracking; accelerometer; gyroscope"
        /* Sandbox restritivo: sem popup, sem download, sem navegação do topo. */
        sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-fullscreen"
        style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
      />
      {!pronto && !erro && <EsqueletoDeCarga camada={camada} />}
      {erro && <PainelDeErro mensagem={erro} />}
    </div>
  );
}

/* Placeholders — substituir pelos componentes do design system. */
function EsqueletoDeCarga({ camada }: { camada: Camada }) {
  return (
    <div style={overlay}>
      <p>Preparando a experiência 3D…</p>
      <small style={{ opacity: .6 }}>camada {camada}</small>
    </div>
  );
}

function PainelDeErro({ mensagem }: { mensagem: string }) {
  /* Regra do produto: entregar um erro explicado é sempre melhor que
     entregar uma tela preta silenciosa. */
  return (
    <div style={overlay}>
      <p><strong>A experiência 3D não pôde ser carregada.</strong></p>
      <small style={{ opacity: .7, maxWidth: 420, textAlign: 'center' }}>{mensagem}</small>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'absolute', inset: 0,
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 8,
  background: '#0B0D11', color: '#F8F6F0',
  font: '14px/1.5 system-ui, sans-serif',
};
