/* ===========================================================================
   ws-bridge.js — barramento de mensagens entre a aplicação White Stone
   e as camadas 3D embutidas por iframe.

   Implementação de referência do CONTRATO-DE-MENSAGENS.md (v1).

   Resolve, em relação ao que existe hoje nos protótipos:
     1. valida event.origin        (hoje: ninguém valida — falha de segurança)
     2. enfileira comandos         (hoje: setTimeout torcendo para ter carregado)
     3. normaliza nomes por versão (hoje: ws:mundo-pronto e ws:studio-pronto)
     4. timeout e erro explícito   (hoje: try/catch vazio engole tudo)

   Sem dependência. Funciona em qualquer front — React, Vue ou HTML puro.
   =========================================================================== */

export const VERSAO_CONTRATO = 1;

/* Eventos legados → nome canônico. Permite corrigir o contrato sem
   reescrever as sete camadas agora. */
const ALIAS = {
  'ws:mundo-pronto':   { tipo: 'ws:pronto', extra: { camada: 'mundo'  } },
  'ws:studio-pronto':  { tipo: 'ws:pronto', extra: { camada: 'studio' } },
  'ws:atelier-abrir':  { tipo: 'ws:abrir-atelier' },
};

const EVENTOS_CONHECIDOS = new Set([
  'ws:pronto', 'ws:lead', 'ws:space-model',
  'ws:entrar-imovel', 'ws:entrar-walkthrough',
  'ws:carrinho', 'ws:atelier-movel', 'ws:atelier-pino',
  'ws:voltar-mundo', 'ws:ir-para-mundo', 'ws:ir-para-studio',
  'ws:abrir-atelier', 'ws:camada-real',
  /* autoria do walkthrough: passagens entre cômodos, pinos de móvel e
     calibração. Antes isso só existia na memória do iframe e sumia no F5. */
  'ws:walkthrough-modelo',
  /* sessão do visitante: onde parou e quanto tempo passou em cada cômodo */
  'ws:walkthrough-sessao',
  /* pedido de geração de ambiente sem endpoint ligado — só metadado */
  'ws:pedido-mundo',
]);

/* Eventos que carregam autoria ou conversão e NÃO podem ser perdidos em
   silêncio. Se ninguém assinou, o bridge avisa: um ws:lead ou um modelo de
   walkthrough que chega e não encontra ouvinte é dado que evaporou. */
const EVENTOS_CRITICOS = new Set([
  'ws:lead', 'ws:space-model', 'ws:walkthrough-modelo',
]);

export class WsBridge {
  /**
   * @param {HTMLIFrameElement} iframe  o iframe da camada
   * @param {object} opcoes
   * @param {string} opcoes.origem     origem exata permitida. OBRIGATÓRIO em produção.
   * @param {number} [opcoes.timeoutMs=20000]  tempo até declarar que a camada não subiu
   * @param {(erro:Error)=>void} [opcoes.aoErro]
   */
  constructor(iframe, { origem, timeoutMs = 20000, aoErro } = {}) {
    if (!iframe) throw new Error('WsBridge: iframe é obrigatório');
    if (!origem) {
      // Falha ruidosa de propósito: '*' em produção é como não ter fechadura.
      throw new Error(
        'WsBridge: informe a origem exata da camada. ' +
        'Em desenvolvimento use window.location.origin.'
      );
    }

    this.iframe   = iframe;
    this.origem   = origem;
    this.pronto   = false;
    this.camada   = null;
    this.fila     = [];
    this.ouvintes = new Map();
    this.aoErro   = aoErro || (e => console.error('[ws-bridge]', e));

    this._onMessage = this._receber.bind(this);
    window.addEventListener('message', this._onMessage);

    this._timer = setTimeout(() => {
      if (!this.pronto) {
        this.aoErro(new Error(
          `A camada não emitiu ws:pronto em ${timeoutMs} ms. ` +
          `Causas prováveis: erro de JavaScript dentro do iframe, ` +
          `CDN de Three.js indisponível, ou origem incorreta ` +
          `(esperada: ${this.origem}).`
        ));
      }
    }, timeoutMs);
  }

  /** Registra um ouvinte. Devolve a função que cancela a inscrição. */
  em(tipo, fn) {
    if (!this.ouvintes.has(tipo)) this.ouvintes.set(tipo, new Set());
    this.ouvintes.get(tipo).add(fn);
    return () => this.ouvintes.get(tipo).delete(fn);
  }

  /** Envia um comando. Se a camada ainda não subiu, enfileira. */
  enviar(tipo, carga = {}) {
    const msg = { ...carga, tipo, v: VERSAO_CONTRATO };
    if (!this.pronto) { this.fila.push(msg); return; }
    this._despachar(msg);
  }

  /** Pedido/resposta. Ex.: await bridge.pedir('ws:pedir-space','ws:space-model') */
  pedir(tipoComando, tipoResposta, carga = {}, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        cancelar();
        reject(new Error(`Sem resposta ${tipoResposta} em ${timeoutMs} ms`));
      }, timeoutMs);
      const cancelar = this.em(tipoResposta, dados => {
        clearTimeout(t); cancelar(); resolve(dados);
      });
      this.enviar(tipoComando, carga);
    });
  }

  destruir() {
    clearTimeout(this._timer);
    window.removeEventListener('message', this._onMessage);
    this.ouvintes.clear();
    this.fila.length = 0;
  }

  /* ------------------------------------------------------------------ */

  _despachar(msg) {
    try {
      this.iframe.contentWindow.postMessage(msg, this.origem);
    } catch (e) {
      this.aoErro(new Error(`Falha ao enviar ${msg.tipo}: ${e.message}`));
    }
  }

  _receber(ev) {
    /* ---- A verificação que hoje não existe em lugar nenhum ---- */
    if (ev.origin !== this.origem) return;
    if (ev.source !== this.iframe.contentWindow) return;

    const bruto = ev.data;
    if (!bruto || typeof bruto !== 'object') return;
    if (typeof bruto.tipo !== 'string' || !bruto.tipo.startsWith('ws:')) return;

    /* ---- normalização de nomes legados ---- */
    const a = ALIAS[bruto.tipo];
    const msg = a ? { ...bruto, ...(a.extra || {}), tipo: a.tipo } : bruto;

    /* ---- versão ---- */
    const v = msg.v ?? 1;
    if (v > VERSAO_CONTRATO) {
      this.aoErro(new Error(
        `Camada fala o contrato v${v}; esta aplicação entende até ` +
        `v${VERSAO_CONTRATO}. Prosseguindo em modo degradado.`
      ));
    }

    /* ---- handshake ---- */
    if (msg.tipo === 'ws:pronto') {
      clearTimeout(this._timer);
      this.pronto = true;
      this.camada = msg.camada || null;
      const fila = this.fila.splice(0);
      fila.forEach(m => this._despachar(m));
    }

    /* ---- desconhecido: registra e segue. Nunca quebra. ---- */
    if (!EVENTOS_CONHECIDOS.has(msg.tipo)) {
      console.info('[ws-bridge] evento não catalogado:', msg.tipo);
    }

    const fns = this.ouvintes.get(msg.tipo);
    if (fns && fns.size) {
      fns.forEach(fn => {
        try { fn(msg); } catch (e) { this.aoErro(e); }
      });
    } else if (EVENTOS_CRITICOS.has(msg.tipo) && !this.ouvintes.has('*')) {
      this.aoErro(new Error(
        `${msg.tipo} chegou e nenhum ouvinte estava registrado. ` +
        `Este evento carrega dado que não se recupera — o usuário fez o ` +
        `trabalho e ele foi descartado. Registre um ouvinte com bridge.em('${msg.tipo}', …).`
      ));
    }

    const todos = this.ouvintes.get('*');
    if (todos) todos.forEach(fn => { try { fn(msg); } catch (e) { this.aoErro(e); } });
  }
}
