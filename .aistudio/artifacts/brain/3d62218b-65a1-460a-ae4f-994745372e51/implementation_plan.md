# Sincronização em Tempo Real no Firestore & Gestão Multiusuário

Plano de modernização para persistência centralizada na nuvem via Google Cloud Firestore, sincronização multiusuário em tempo real e sistema de controle de acesso (RBAC) com perfis de Administrador e Consulta.

> [!IMPORTANT]
> **Decisões Alinhadas na Fase de Clarificação:**
> - **Controle de Acesso:** Novos usuários cadastrados iniciam automaticamente com a permissão **Consulta** (apenas visualização). Qualquer **Administrador** pode promover o usuário a Administrador na aba de Gestão de Usuários.
> - **Métodos de Login:** Ambos os métodos estão disponíveis e integrados: **Login Institucional Google** e **E-mail com Senha**.
> - **Auditoria e Atribuição:** Sincronização de dados em tempo real sem exigência de assinatura nominal de autor em cada registro de militar, priorizando agilidade e privacidade operacional.

---

## 1. Visão Geral e Conceito Central

- **O que faz:** Migra o armazenamento isolado em `localStorage` para uma base de dados em tempo real no **Google Cloud Firestore**. Sempre que um administrador cadastrar, prorrogar contrato, editar ou desligar um bombeiro militar temporário, a atualização é refletida instantaneamente para todos os outros usuários conectados no sistema.
- **Público-alvo:** Gestores, analistas e comando da Diretoria de Gestão de Pessoas (DGP) do Corpo de Bombeiros Militar de Mato Grosso (CBMMT).
- **Valor Agregado:** Eliminação do risco de descompasso de dados entre computadores e turnos de trabalho, garantindo visão única e consolidada do efetivo de temporários no estado.

---

## 2. Experiência do Usuário e Design Visual

### Fluxos Principais
1. **Autenticação Flexível:** O usuário escolhe entre o botão corporativo Google ou formulário de e-mail e senha. Na primeira autenticação, o perfil é provisionado no Firestore com status `CONSULTA`.
2. **Navegação com Permissões Dinâmicas:**
   - **Administrador:** Acesso total a inclusões, prorrogações, edições, desligamentos, reativações e aba de Usuários & Acessos.
   - **Consulta:** Visualização completa do efetivo, quadros (Condutores, Técnicos, Enfermeiros, Médicos), filtros, relatórios analíticos e exportação em PDF, com botões de mutação bloqueados com indicação amigável de permissão.
3. **Gestão de Usuários (Configurações):** Administradores visualizam a lista de todos os usuários cadastrados, data de cadastro, último acesso e um seletor rápido para alternar entre "Administrador" e "Consulta".
4. **Sincronização em Tempo Real Silenciosa:** O app escuta alterações no Firestore via listener em tempo real (`onSnapshot`), invalidando o cache do React Query instantaneamente sem necessidade de recarregar a página (F5).

### Identidade Visual e Estilo
- **Tema:** Dark mode sofisticado e institucional com background translúcido (Glassmorphism), mantendo a paleta oficial em tons de azul-marinho profundo (`#0b1329`), carmim escuro e acentos em azul vibrante (`#2563eb`).
- **Tipografia:** Hierarquia robusta com Inter/Roboto, rótulos limpos e contraste em conformidade com as diretrizes de acessibilidade.
- **Feedback Interativo:** Toasts visuais para confirmação de salvamento na nuvem, indicadores de status sincronizado e modais de confirmação claros para exclusão ou mudança de perfil.

---

## 3. Decisões Técnicas e Trade-Offs

- **Persistência Centralizada no Firestore:**
  - *Abordagem:* Centralização do documento da corporação (`corporacao/dados`) e coleção de usuários (`usuarios/{uid}`).
  - *Motivo:* Resolução definitiva do problema onde alterações feitas em uma máquina não apareciam para outros usuários. O Firestore oferece listeners em tempo real (`onSnapshot`) nativos e alta confiabilidade.
- **Cache Local com Fallback Resiliente:**
  - *Abordagem:* Mantém cópia em memória/cache sincronizada que hidrata a interface imediatamente, garantindo que o app abra em milissegundos mesmo antes do primeiro retorno de rede.
- **Transição Transparente:**
  - *Abordagem:* O primeiro carregamento importa automaticamente os dados locais pré-existentes para o Firestore caso a base na nuvem ainda não possua o documento mestre inicial.

---

## 4. Arquitetura Técnica e Estratégia de Dados

### Diagrama do Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                     Navegadores Clientes                        │
│                                                                 │
│  ┌───────────────────────┐           ┌───────────────────────┐  │
│  │     Administrador     │           │       Consulta        │  │
│  │ (Edição, Gestão User) │           │ (Leitura, Relatórios) │  │
│  └───────────┬───────────┘           └───────────▲───────────┘  │
│              │ Escrita (setDoc)                  │              │
└──────────────┼───────────────────────────────────┼──────────────┘
               │                                   │ Real-time Sync
               ▼                                   │ (onSnapshot)
┌──────────────────────────────────────────────────┴──────────────┐
│                   Google Cloud Firestore                        │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Coleção: /corporacao/dados                               │  │
│  │  - militares: MilitarTemporario[]                         │  │
│  │  - desligamentos: DesligamentoRegistro[]                  │  │
│  │  - ultimaAtualizacao: timestamp ISO                       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Coleção: /usuarios/{uid}                                 │  │
│  │  - uid: string                                            │  │
│  │  - email: string                                          │  │
│  │  - nome: string                                           │  │
│  │  - perfil: "ADMIN" | "CONSULTA"                           │  │
│  │  - criadoEm: string                                       │  │
│  │  - ultimoAcesso: string                                   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Mapeamento de Estado e Componentes

1. **Camada de Dados (`src/lib/mockBackend.ts` e `src/lib/firebase.ts`):**
   - Configuração do listener em tempo real no documento `/corporacao/dados`.
   - Mutação via `setDoc` para inserção, edição, exclusão e desligamento, disparando a atualização para todos os clientes conectados.
   - Gerenciamento da coleção `/usuarios` com funções de listagem e atualização de `perfil`.
2. **Controle de Sessão e Auth (`src/lib/session.ts` & `src/pages/Login.tsx`):**
   - Criação/leitura do perfil no Firestore no momento do login.
   - Atribuição do primeiro usuário (`joao1canavarros@gmail.com`) ou configuração de privilégio inicial como ADMIN, enquanto novos usuários recebem CONSULTA até promoção.
3. **Página de Usuários e Permissões (`src/pages/Configuracoes.tsx`):**
   - Tabela de gestão de usuários permitindo ao administrador alternar permissões de outros membros em tempo real.
4. **Proteção de Interface (`src/components/AppShell.tsx` & componentes de formulário):**
   - Desativação elegante de botões de edição/exclusão quando o usuário ativo possui perfil CONSULTA, acompanhado de tooltip explicativo.
