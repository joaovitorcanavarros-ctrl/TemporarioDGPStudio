# Plano de Implementação: PRD Completo e Especificação de Testes Automatizados e de Segurança (CBMMT/DGP)

## 1. Visão Geral e Alinhamento com o Usuário

O objetivo é fornecer um **Product Requirements Document (PRD) de Nível de Engenharia de Software e Segurança da Informação**, voltado especificamente para alimentação de ferramentas de testes automatizados, agentes de QA automatizados (Playwright, Cypress, Postman/Newman) e scanners de vulnerabilidade/segurança (OWASP ZAP, Burp Suite, SonarQube, DAST/SAST).

Com base nas respostas do usuário:
- **Escopo**: Completo, cobrindo todos os módulos funcionais, regras de negócio institucionais do CBMMT, controle de acesso baseado em funções (RBAC), auditoria imutável, contratos de dados e vetores de exploração/segurança.
- **Formato de Entrega**:
  1. Arquivo Markdown técnico detalhado na raiz do projeto (`/PRD_TESTES_AUTOMATIZADOS.md`).
  2. Nova rota/tela no painel administrativo (`/prd-testes`) com visualizador estilizado em abas temáticas, formatação monospaçada de contratos e botão direto para **Baixar PRD (.md)**.

---

## 2. Arquitetura do Sistema e Especificação Visual

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CBMMT / DGP - Applet SPA                             │
│                                                                                 │
│   ┌─────────────────────┐   ┌───────────────────────────────────────────────┐   │
│   │ AppShell (Sidebar)  │   │ Visualizador do PRD (/prd-testes)             │   │
│   │                     │   │ ───────────────────────────────────────────── │   │
│   │ • Dashboard         │   │ [Header: Especificação de Testes e Segurança] │   │
│   │ • Temporários       │   │ [Tabs: Visão Geral | Casos de Teste |         │   │
│   │ • Desligamentos     │   │        Contratos API | Matriz RBAC & Sec ]    │   │
│   │ • Relatórios        │   │                                               │   │
│   │ • Configurações     │   │ [Preview Renderizado / Markdown Completo]     │   │
│   │ • PRD & Testes (NEW)│   │                                               │   │
│   │                     │   │ [Ações: Copiar Markdown | Baixar Arquivo .md] │   │
│   └─────────────────────┘   └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Identidade Visual e Padrões de Interface (SaaS Dashboard)
- **Tema**: Azul institucional CBM-MT (`#0A0F18`, `#121B28`, `#1E2C42`, azul militar `#1D4ED8` / `#2563EB`).
- **Tipografia**: `font-sans` para interface e cabeçalhos editoriais; `font-mono` para rotas, contratos de payloads, códigos de status HTTP e parâmetros técnicos de auditoria.
- **Hierarquia de Controles**: Botão primário no cabeçalho `Baixar PRD Completo (.md)` com ícone `Download`, botão secundário `Copiar Especificação` com feedback visual imediato.

---

## 3. Escopo do Documento (PRD_TESTES_AUTOMATIZADOS.md)

O PRD a ser gerado incluirá as seguintes seções estruturadas para ingestão automatizada:

### Seção 1: Identificação do Sistema e Contexto Institucional
- Nome: **Sistema de Gestão de Militares Temporários — CBMMT / DGP**
- Órgão: Corpo de Bombeiros Militar de Mato Grosso — Diretoria de Gestão de Pessoas
- Objetivo: Controle de efetivo de bombeiros temporários, vigência de contratos, prorrogações, desligamentos, auditoria oficial e geração de relatórios formais em PDF com marca d'água institucional.

### Seção 2: Atores e Matriz de Controle de Acesso (RBAC)
- **Perfis de Usuário**:
  1. `ADMIN` (Acesso irrestrito: inclusão, edição rápida, exclusão de categorias inativas, desligamento, reativação, importação CSV, gestão de usuários e auditoria).
  2. `CONSULTA` (Apenas leitura em Dashboard, Efetivo e Relatórios; restrito de mutações cadastrais, exclusões e parametrizações).
- **Matriz de Permissões por Rota e Ação**:
  - Tabela formal de métodos HTTP (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) e exigência de autenticação/perfil.

### Seção 3: Especificação de Casos de Teste Funcionais (BDD / Gherkin)
- **Módulo 1: Gestão de Militares Temporários**:
  - Inclusão manual (campos obrigatórios, validação de unicidade de matrícula com e sem sufixo/vínculo).
  - Edição rápida e alteração de vencimento contratual.
  - Desligamento formal (motivo, boletim geral e data efetiva).
  - Reativação com registro histórico obrigatório.
- **Módulo 2: Importação em Lote via CSV**:
  - Upload de arquivos, mapeamento de cabeçalhos, validação sintática e semântica (detecção de matrículas duplicadas, criação de lotações/cargos sob demanda).
- **Módulo 3: Relatórios Oficiais e Histórico Funcional**:
  - Consultas analíticas (efetivo por cargo, por UBM, desligamentos por motivo).
  - Histórico Individual por Matrícula: busca flexível (formatos `352112/02`, `352112`, dígitos puros), geração de linha do tempo cronológica com admissão, vigência, auditorias e desligamento.
  - Geração de PDF oficial com cabeçalho de Estado, Brasão CBM-MT, numeração e marca d'água.
- **Módulo 4: Configurações e Categorias**:
  - Inserção e desativação de categorias.
  - Exclusão permitida apenas para perfis de Administrador quando não houver militares vinculados.

### Seção 4: Contratos de Dados e Catálogo de APIs (REST)
- Especificação formal de endpoints, parâmetros de query (`qs`), corpo da requisição (`JSON`) e esquemas de resposta esperados com status codes (`200 OK`, `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`).

### Seção 5: Guia de Testes de Segurança e Testes de Penetração (OWASP Top 10)
- **A01: Quebra de Controle de Acesso (Broken Access Control)**:
  - Testes de escalonamento de privilégios (`CONSULTA` tentando disparar rotas de exclusão de categoria ou edição de militares).
  - Testes de acesso direto a IDs de outros militares ou modificação sem permissão.
- **A02: Falhas Criptográficas e Armazenamento Sensível**:
  - Verificação de persistência de tokens/sessões em `localStorage`/`sessionStorage`.
  - Tratamento de hashes e descarte seguro de senhas no retorno de `/usuarios`.
- **A03: Injeção (SQL / NoSQL / CSV Injection)**:
  - Teste de injeção de fórmulas CSV (`=cmd|' /C ...'!A1`) em nomes ou matrículas durante importação e exportação de planilhas.
  - Validação de caracteres especiais em campos de texto livre (`observacoes`, `documento_desligamento`).
- **A04: Design Inseguro & Integridade de Auditoria**:
  - Garantia de que nenhuma alteração funcional (vencimento, lotação, reativação) ocorra sem geração síncrona de evento de log em `store.alteracoes`.
  - Proibição de rotas de deleção ou alteração na coleção de auditoria (logs append-only).
- **A05: Configuração Incorreta de Segurança (Security Misconfiguration)**:
  - Verificação de cabeçalhos de resposta, integridade de rotas API proxy e tratamento de erros sem vazamento de stack traces em produção.
- **A07: Falhas de Identificação e Autenticação**:
  - Validação de fluxo Google OAuth cliente popup e proteção contra spoofing de identidade via requisição manual.

---

## 4. Etapas de Execução

1. **Geração do Arquivo `PRD_TESTES_AUTOMATIZADOS.md`**:
   - Criar o documento na raiz do projeto com formatação Markdown impecável, tabelas BDD, schemas JSON, matriz RBAC e cenários de ataque/segurança.
2. **Integração na Interface do Applet**:
   - Adicionar item de navegação no menu lateral (`AppShell.tsx`): "PRD & Testes de QA".
   - Criar a página `/src/pages/PrdTestes.tsx` com visualizador interativo em abas, botão de copiar conteúdo e botão de download do arquivo `.md`.
   - Adicionar a rota em `App.tsx`.
3. **Validação e Compilação**:
   - Executar `compile_applet` para certificar integridade de tipos e ausência de erros de compilação.
   - Reiniciar o servidor de desenvolvimento.

---

## 5. Critérios de Aceitação e Verificação

- [ ] Arquivo `/PRD_TESTES_AUTOMATIZADOS.md` presente e completo no repositório.
- [ ] Rota `/prd-testes` funcional e acessível pela barra de navegação lateral.
- [ ] Botão de download baixando com sucesso o arquivo Markdown formatado.
- [ ] Conteúdo do PRD pronto para ingestão direta em ferramentas automatizadas de teste e segurança (Playwright, OWASP ZAP, Postman).
- [ ] Compilação limpa sem erros TypeScript ou quebra de layouts existentes.
