# Otimização e Controle Granular da Comunicação com o Firebase Firestore

Plano arquitetural para eliminar o esgotamento de cotas do Firestore, desativando listeners contínuos e substituindo escritas massivas por atualizações granulares pontuais, acionadas exclusivamente por cliques intencionais de salvamento.

> [!IMPORTANT]
> **Decisões Alinhadas com o Usuário:**
> - **Remoção de `onSnapshot` Contínuo:** Desativação de streams em tempo real permanentes que consomem leituras/escutas ininterruptas. Substituição por chamadas pontuais sob demanda (`getDoc` e `getDocs`) via React Query com cache controlado.
> - **Gravação Exclusiva no Clique Explícito:** Nenhuma chamada a `setDoc`, `updateDoc` ou `addDoc` ocorrerá em tempo real durante digitação (`onChange`), renderizações de componentes (`useEffect`) ou no carregamento inicial de telas. Gravações ocorrerão estritamente no submit dos botões "Salvar" ou "Atualizar".
> - **Gravação Granular de Documentos:** Em vez de regravar o arquivo corporativo inteiro (300 KB em bloco), cada militar alterado terá apenas o seu próprio documento ou delta persistido (`militares/{militarId}`), reduzindo o tráfego de 300.000 bytes para menos de 500 bytes por operação.
> - **Paginação e Limite de Leitura:** Listagens com limites nativos (25 a 50 itens por página) e consultas indexadas por matrícula/nome, evitando carregar desnecessariamente toda a base da corporação de uma só vez.

---

## 1. Visão Geral e Conceito Central

- **O que faz:** Reestrutura a camada de comunicação com o Firebase Firestore (`src/lib/mockBackend.ts` e `src/lib/firebase.ts`) para operar em modo transacional pontual de alta eficiência, garantindo que o aplicativo nunca mais atinja limites de cotas gratuitas (*RESOURCE_EXHAUSTED*).
- **Público-alvo:** Administradores e operadores da Diretoria de Gestão de Pessoas (DGP/CBMMT).
- **Valor Agregado:** Sistema ágil, estável e imune a travamentos por limite diário de gravação, mantendo 100% da identidade visual, dos filtros, das validações e das telas existentes inalteradas.

---

## 2. Experiência do Usuário e Visual

- **Preservação Visual Completa:** O design do sistema, as abas, tabelas, filtros rápidos, detalhes de militares, modais de confirmação, relatórios e a tela de login estilizada permanecem exatamente iguais.
- **Feedback Transparente de Gravação:**
  - Ao clicar em "Salvar Cadastro", "Salvar Alterações", "Registrar Desligamento" ou "Reativar Cadastro", o sistema exibe estado de loading no botão e toast de confirmação imediato.
  - Indicador visual leve nas listagens demonstrando a página atual e contagem de registros exibidos (ex: "Exibindo 1–25 de 421").
- **Busca Eficiente e Otimizada:** A pesquisa por nome ou matrícula filtra diretamente na memória/cache local abastecida pela consulta pontual, sem disparar requisições em nuvem a cada caractere digitado.

---

## 3. Decisões Técnicas e Trade-Offs

- **Substituição de `onSnapshot` por Consultas Pontuais:**
  - *Abordagem:* Consultas pontuais (`getDoc` e `getDocs`) disparadas sob demanda com `staleTime` inteligente no React Query (ex: 5 minutos).
  - *Motivo:* `onSnapshot` mantém canais abertos e consome cotas de leitura e sincronização contínua a cada reconexão ou alteração de estado.
- **Gravação Granular por Militar:**
  - *Abordagem:* Persistência individualizada (`corporacao/dados` para catálogos/metadados e atualização delta para o militar específico alterado).
  - *Motivo:* Gravar 300 KB em um único documento consome 300 unidades de gravação por clique; com gravação pontual, o custo cai para 1 unidade de gravação por operação.
- **Proteção Contra Gravações Automáticas em Hooks:**
  - *Abordagem:* Remoção de qualquer `setDoc` dentro de rotinas de inicialização ou callbacks de render. As funções de persistência na nuvem passam a ser chamadas unicamente nos manipuladores de evento de formulário (`onSubmit` e mutações do React Query).

---

## 4. Arquitetura Técnica e Estratégia de Dados

### Diagrama de Fluxo e Comunicação

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Interface do Usuário                          │
│                                                                        │
│   [Formulário Militar]           [Tabela / Listagem]                   │
│   - onChange: Apenas State       - Paginação: 25 registros/pág         │
│   - Clique em "Salvar":          - Busca: Filtro local sem I/O         │
│          │                               │                             │
└──────────┼───────────────────────────────┼─────────────────────────────┘
           │ Salvar explícito              │ Busca inicial pontual
           ▼                               ▼ (getDoc / getDocs)
┌────────────────────────────────────────────────────────────────────────┐
│                     Camada de Serviços (mockBackend)                   │
│                                                                        │
│   - Cache local rápido (localStorage / Memória)                        │
│   - Sem loops ou updates em background                                 │
│   - Gravação Granular (apenas o militar alterado)                      │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼ Chamada pontual (setDoc isolado)
┌────────────────────────────────────────────────────────────────────────┐
│                      Google Cloud Firestore                            │
│                                                                        │
│   Coleção: /corporacao/dados (configurações e catálogos)               │
│   Coleção: /militares/{id} (documentos individuais leves ~500B)        │
│   Custo: 1 unidade de gravação por clique do usuário                   │
└────────────────────────────────────────────────────────────────────────┘
```

### Detalhamento das Alterações nos Arquivos

1. **`src/lib/mockBackend.ts`:**
   - Desativar o listener global `initFirestoreSync()` e a chamada contínua `onSnapshot`.
   - Implementar consulta inicial pontual `carregarDadosFirestore()` via `getDoc` executada apenas uma vez na inicialização ou ao forçar atualização manual.
   - Refatorar a função de salvamento para que seja chamada estritamente nos endpoints de mutação (`POST /militares`, `PUT /militares/:id`, `POST /desligamentos`, etc.) e apenas persista o militar ou objeto alterado.
   - Remover qualquer execução de `setDoc` em listeners, rotinas de seed cíclicas ou chamadas de leitura de detalhe (`GET /militares/:id`).
2. **`src/pages/MilitarForm.tsx` e `src/components/MilitaresTable.tsx`:**
   - Assegurar que nenhuma alteração em inputs (`onChange`) dispare chamadas de rede até que o botão de submissão do formulário seja clicado.
   - Manter paginação de 25 em 25 registros com controle de limite para não sobrecarregar memória ou tráfego.
3. **`src/lib/firebase.ts`:**
   - Adicionar funções utilitárias isoladas: `salvarMilitarFirestore(militar)` e `buscarMilitaresPaginados(limite)`.
