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

/** Onde cada camada está publicada. Em produção, um subdomínio próprio —
 *  ver o documento de auditoria, seção "isolamento de origem". */
const CAMINHO: Record<Camada, string> = {
  mundo:       '/camadas/mundo-3d/WS_MUNDO.html',
  studio:      '/camadas/studio-3d/WS_STUDIO.html',
  atelier:     '/camadas/atelier/WS_ATELIER.html',
  tour:        '/camadas/tour-360/WS_REAL.html',
  walkthrough: '/camadas/walkthrough/WS_MINT.html',
};

export interface Imovel {
  id: string; nome: string; endereco?: string;
  lat?: number; lon?: number;
  area?: number; quartos?: number; suites?: number; vagas?: number;
  preco?: number; wsi?: number; status?: string;
}

export interface Midia {
  splat?: string; colisor?: string;
  panoramas?: string[]; fotos?: string[];
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

interface Props {
  camada: Camada;
  imovel?: Imovel;
  space?: unknown;
  midia?: Midia;
  /** Origem da camada. Em produção: o subdomínio onde ela vive. */
  origem?: string;
  aoReceberLead?: (lead: Lead) => void;
  aoSalvarProjeto?: (space: unknown, imovelId: string) => void;
  aoMudarCarrinho?: (itens: { sku: string; nome: string; preco: number }[]) => void;
  aoNavegar?: (destino: string, dados?: unknown) => void;
  aoErro?: (erro: Error) => void;
  className?: string;
}

export function WsCamada({
  camada, imovel, space, midia,
  origem = typeof window !== 'undefined' ? window.location.origin : '',
  aoReceberLead, aoSalvarProjeto, aoMudarCarrinho, aoNavegar, aoErro,
  className,
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

      b.em('ws:carrinho', (m: any) => aoMudarCarrinho?.(m.itens)),

      /* navegação — a aplicação decide a rota, a camada só pede */
      ...(['ws:voltar-mundo', 'ws:ir-para-mundo', 'ws:ir-para-studio',
           'ws:abrir-atelier', 'ws:camada-real',
           'ws:entrar-imovel', 'ws:entrar-walkthrough'] as const)
        .map(t => b.em(t, (m: any) => aoNavegar?.(t, m))),
    ];

    return () => { inscricoes.forEach(cancelar => cancelar()); b.destruir(); };
  }, [camada, origem, tratarErro,
      aoReceberLead, aoSalvarProjeto, aoMudarCarrinho, aoNavegar]);

  /* injeta o imóvel assim que houver dado — o bridge enfileira se preciso */
  useEffect(() => {
    if (!imovel) return;
    bridgeRef.current?.enviar('ws:carregar-imovel', { imovel, space, midia });
  }, [imovel, space, midia, pronto]);

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <iframe
        ref={ref}
        src={CAMINHO[camada]}
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
