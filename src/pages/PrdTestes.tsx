import { useState } from "react";
import {
  Check,
  Code2,
  Copy,
  Download,
  FileCheck,
  FileText,
  Lock,
  Layers,
  Shield,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadText } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRD_RAW_CONTENT = `# Product Requirements Document (PRD) — Especificação Técnica para Testes Automatizados e Auditoria de Segurança

**Aplicação**: Sistema de Gestão de Militares Temporários  
**Órgão / Cliente**: Diretoria de Gestão de Pessoas (DGP) — Corpo de Bombeiros Militar do Estado de Mato Grosso (CBMMT)  
**Versão**: 2.4.0-PROD  
**Data de Emissão**: 27 de Outubro de 2026  
**Finalidade do Documento**: Especificação formal para ingestão e execução por ferramentas de testes automatizados (Playwright, Cypress, Postman/Newman, k6) e scanners de vulnerabilidade/segurança de aplicações web (OWASP ZAP, Burp Suite, SonarQube, DAST/SAST).

---

## 1. Visão Geral da Arquitetura e Superfície de Ataque

### 1.1 Topologia do Sistema
- **Tipo de Aplicação**: Single Page Application (SPA) em React 19 + TypeScript + Vite + Tailwind CSS.
- **Backend / Camada de Persistência**:
  - Servidor Node.js / Express integrado (handler REST com persistência de dados em Firestore e armazenamento de sessão).
  - Firebase Authentication com suporte a Provedor Google OAuth (signInWithPopup).
- **Padrão de Comunicação**: RESTful JSON via métodos GET, POST, PUT, PATCH e DELETE.
- **Geração de Arquivos**:
  - Exportação de documentos oficiais em PDF institucional com marca d'água do Brasão CBMMT via jspdf e jspdf-autotable.
  - Exportação e importação tabular de planilhas CSV e XLSX.

---

## 2. Matriz de Controle de Acesso Baseado em Funções (RBAC)

O sistema implementa dois níveis de privilégio de usuário:

| Perfil | Descrição | Permissões Permitidas | Permissões Proibidas |
| :--- | :--- | :--- | :--- |
| **ADMIN** | Gestor da DGP / Administrador do Sistema | Leitura total, Inclusão de Militares, Edição Rápida, Desligamento, Reativação, Importação CSV, Exclusão de Categorias sem vínculo, Criação/Edição de Usuários, Visualização de Auditoria. | Excluir registros da trilha de auditoria (audit logs são imutáveis e append-only). |
| **CONSULTA** | Operador / Consulta Informativa | Leitura de Dashboard, Consulta de Temporários, Emissão de Relatórios, Busca de Histórico Funcional. | Criar/Editar/Desligar militares, Importar CSV, Alterar Configurações, Excluir categorias, Gerenciar usuários. |

### Matriz de Endpoints vs Permissões

| Método | Endpoint | Perfil Mínimo | Comportamento Esperado para Perfil Inválido |
| :--- | :--- | :--- | :--- |
| GET | /auth/me | Autenticado | HTTP 401 Unauthorized |
| POST | /auth/login | Público | HTTP 401 com credenciais inválidas |
| POST | /auth/google | Público | HTTP 400 sem e-mail válido |
| GET | /dashboard | CONSULTA | HTTP 401 se não autenticado |
| GET | /militares | CONSULTA | HTTP 401 se não autenticado |
| POST | /militares | ADMIN | HTTP 403 Forbidden se perfil CONSULTA |
| GET | /militares/:id | CONSULTA | HTTP 404 Not Found se ID inexistente |
| PATCH | /militares/:id/rapido | ADMIN | HTTP 403 Forbidden |
| PUT | /militares/:id | ADMIN | HTTP 403 Forbidden |
| POST | /militares/:id/desligar | ADMIN | HTTP 403 Forbidden |
| POST | /militares/:id/reativar | ADMIN | HTTP 403 Forbidden |
| GET | /relatorios/:tipo | CONSULTA | HTTP 401 se não autenticado |
| POST | /importacao/analisar | ADMIN | HTTP 403 Forbidden |
| POST | /importacao/validar | ADMIN | HTTP 403 Forbidden |
| POST | /importacao/aplicar | ADMIN | HTTP 403 Forbidden |
| DELETE | /catalogos/categorias/:id | ADMIN | HTTP 403 Forbidden ou HTTP 400 se houver militares vinculados |
| GET | /auditoria | ADMIN | HTTP 403 Forbidden para CONSULTA |

---

## 3. Especificação de Contratos de Dados (Data Contracts & APIs)

### 3.1 Entidade Militar
\`\`\`typescript
interface Militar {
  id: string;                          // Identificador único (ex: "mil_1730000000")
  matricula: string;                   // Matrícula funcional institucional (ex: "352112/02")
  nome_completo: string;               // Nome completo em caixa alta
  cargo_id: string;                    // Foreign Key -> Cargo
  lotacao_id: string;                  // Foreign Key -> Lotação/UBM
  edital_id: string;                   // Foreign Key -> Edital
  data_inclusao: string;               // Formato ISO YYYY-MM-DD
  data_vencimento_contrato: string;    // Formato ISO YYYY-MM-DD
  status: "ATIVO" | "DESLIGADO";       // Estado funcional atual
  observacoes: string | null;          // Texto livre sanitizado
  doe_incorporacao: string | null;     // Diário Oficial do Estado (ex: "DOE nº 28.512")
  sub_judice: boolean;                 // Flag indicadora de decisão judicial
  data_desligamento: string | null;    // ISO YYYY-MM-DD se status == "DESLIGADO"
  motivo_desligamento_id: string | null;
  documento_desligamento: string | null; // Boletim Geral ou Portaria de desligamento
  criado_em: string;                   // ISO 8601 Timestamp UTC
  atualizado_em: string;               // ISO 8601 Timestamp UTC
}
\`\`\`

### 3.2 Regras de Unicidade e Normalização de Matrícula
1. Unicidade: Nenhuma matrícula duplicada pode ser persistida.
2. Matching Flexível: Na busca de histórico, o sistema deve resolver com paridade as seguintes entradas equivalentes para a matrícula 352112/02:
   - Digitação com barra: "352112/02"
   - Digitação apenas da base: "352112"
   - Digitação apenas numérica: "35211202"
   - Digitação com hífen: "352112-02"
   - Digitação com espaços: " 352112 / 02 "
   - Busca parcial por nome (ex: "ABRAAO").

### 3.3 Regras de Vencimento e Alertas Contratuais
- Alerta de Vencimento (alerta):
  - A_VENCER: Se status == "ATIVO" e a diferença entre hoje e data_vencimento_contrato estiver no intervalo [0, 30 dias].
  - VENCIDO: Se status == "ATIVO" e a diferença for negativa (< 0 dias).
  - null: Contrato vigente com prazo > 30 dias ou militar já desligado.

---

## 4. Casos de Teste Funcionais Automatizados (Cenários BDD / Gherkin)

### Cenário 1: Inclusão Manual de Militar com Validação de Matrícula Duplicada
\`\`\`gherkin
Funcionalidade: Cadastro de Bombeiro Temporário
  Como Administrador do Sistema
  Quero cadastrar um novo militar temporário
  Para garantir o controle de efetivo do CBMMT

  Cenário: Tentativa de cadastro com matrícula já existente
    Dado que o usuário está autenticado com perfil "ADMIN"
    E já existe um militar com matrícula "352112/02"
    Quando o usuário tenta cadastrar um novo militar com matrícula "352112/02"
    Então o sistema deve recusar a operação com código HTTP 409
    E exibir a mensagem "Já existe cadastro para a matrícula 352112/02"

  Cenário: Cadastro com sucesso com campos obrigatórios
    Dado que o usuário está autenticado com perfil "ADMIN"
    Quando preenche matrícula "359999/01", nome "CARLOS SILVA", cargo válido, lotação válida
    E data de inclusão "2026-01-10" e vencimento "2027-01-09"
    Então o militar é criado com status "ATIVO"
    E uma entrada de auditoria "NOVO_CADASTRO" é registrada imediatamente.
\`\`\`

### Cenário 2: Exclusão de Categorias com Proteção de Integridade Relacional
\`\`\`gherkin
Funcionalidade: Gerenciamento de Categorias de Cargos
  Como Administrador
  Quero poder excluir categorias que não estejam em uso

  Cenário: Tentativa de exclusão de categoria com militares vinculados
    Dado que a categoria "CONDUTOR" possui cargos associados a militares ativos
    Quando o Administrador solicita a exclusão da categoria
    Então a operação deve ser rejeitada com código HTTP 400
    E a mensagem deve indicar a quantidade de militares ativos vinculados à categoria.

  Cenário: Exclusão de categoria sem nenhum militar associado
    Dado que existe uma categoria "INATIVA_TESTE" sem nenhum cargo ou militar
    Quando o Administrador clica em "Excluir Categoria" e confirma
    Então a categoria é removida com sucesso
    E o evento de auditoria "EXCLUSAO_CATEGORIAS" é registrado com os dados anteriores.
\`\`\`

### Cenário 3: Consulta e Exportação de Histórico Funcional em PDF
\`\`\`gherkin
Funcionalidade: Emissão de Histórico Funcional por Matrícula
  Como Operador de Consulta ou Administrador
  Quero buscar o histórico de um militar digitando sua matrícula
  Para exportar a Ficha Funcional oficial em PDF

  Cenário: Busca de militar por dígitos puros
    Dado que o usuário acessa a página de Relatórios
    E seleciona o tipo "Histórico individual por matrícula"
    Quando digita "352112" no campo de busca
    Então o sistema localiza "ABRAAO CAVALCANTE GAMBARRA (352112/02)"
    E exibe a linha do tempo contendo:
      | Evento | Detalhes |
      | INCLUSÃO / ADMISSÃO | Inclusão no CBMMT como Soldado... |
      | VIGÊNCIA CONTRATUAL | Vigência do contrato de Bombeiro Temporário fixada para... |
    E o botão "Exportar PDF" gera documento contendo o Brasão do CBMMT e numeração de páginas.
\`\`\`

---

## 5. Matriz de Testes de Segurança e Vetores de Vulnerabilidade (OWASP Top 10)

Esta seção orienta a configuração de ferramentas DAST (Dynamic Application Security Testing) e testes de penetração automatizados.

### 5.1 A01: Broken Access Control (Controle de Acesso Quebrado)
- Vetor 1: Injeção de Parâmetros de Perfil no Login
  - Payload: POST /auth/google enviando body modificado { email: "hacker@gmail.com", perfil: "ADMIN" }.
  - Comportamento Esperado: O backend não deve aceitar o campo perfil enviado pelo cliente; o perfil deve ser determinado estritamente pelo cadastro do banco de dados ou lista restrita de administradores autorizados.
- Vetor 2: Execução de Ações Administrativas por Usuário Consulta
  - Payload: Executar POST /militares, POST /militares/:id/desligar, DELETE /catalogos/categorias/:id com sessão autenticada de usuário CONSULTA.
  - Comportamento Esperado: O sistema deve abortar imediatamente com HTTP 403 Forbidden e registrar tentativa de violação na auditoria.

### 5.2 A02: Cryptographic Failures & Sensitive Data Exposure (Exposição de Dados Sensíveis)
- Vetor 1: Vazamento de Hash de Senha em APIs de Usuário
  - Endpoint: GET /usuarios.
  - Verificação: Garantir que as propriedades senha, senha_hash ou segredos nunca sejam serializadas na resposta JSON enviada ao frontend.
- Vetor 2: Proteção de Chaves e Credenciais no Bundle
  - Verificação: Nenhuma chave de serviço privada (private_key, client_secret) pode estar exposta no código-fonte cliente JavaScript/Vite. Apenas identificadores públicos do cliente Firebase são permitidos.

### 5.3 A03: Injection & CSV Formula Injection (Injeção de Fórmulas e Comandos)
- Vetor 1: CSV Formula Injection (Excel Macro Execution)
  - Cenário de Teste: Cadastrar militar com nome ou observação iniciando por =, +, -, @ (ex: =cmd|'/C calc'!A1 ou =HYPERLINK("http://malicioso.com")).
  - Comportamento Esperado: Na exportação CSV (exportFile ou toCsv), caracteres especiais que disparam execução de fórmulas em softwares de planilha devem ser devidamente escapados com apóstrofo prefixado (').
- Vetor 2: Cross-Site Scripting (Stored XSS) em Campos Textuais
  - Payload: <script>alert(document.cookie)</script>, <img src=x onerror=alert(1)> no campo observacoes, nome_completo ou documento_desligamento.
  - Comportamento Esperado: O React deve sanitizar a renderização no DOM prevenindo execução de script; na geração do PDF via jspdf, o texto deve ser impresso como string literal pura sem injeção de comandos de renderização.

### 5.4 A04: Insecure Design & Imutabilidade de Auditoria
- Vetor 1: Violação da Trilha de Auditoria (Audit Tampering)
  - Regra de Negócio: Toda e qualquer alteração de estado (novo cadastro, edição de data de vencimento, desligamento, reativação, exclusão de categoria) DEVE gerar um registro síncrono em store.alteracoes.
  - Teste de Invariante: Disparar uma mutação e verificar se o total de registros de auditoria incrementou exatamente em +1.
  - Teste de Deleção: Nenhuma rota DELETE /auditoria ou DELETE /auditoria/:id deve existir no backend. Registros de auditoria são legalmente permanentes.

### 5.5 A05: Security Misconfiguration & Rate Limiting
- Vetor 1: Tratamento de Erros e Stack Trace Leakage
  - Teste: Enviar JSON malformado para rotas POST e verificar se a resposta de erro contém traces de servidor, caminhos absolutos do sistema operacional ou credenciais de banco.
  - Comportamento Esperado: Mensagem de erro em formato padronizado { detail: "Mensagem amigável" }.

---

## 6. Checklist de Validação para Ferramentas Automatizadas

| ID do Teste | Módulo | Tipo de Teste | Critério de Sucesso |
| :--- | :--- | :--- | :--- |
| TC-SEC-01 | Autenticação | DAST / Auth | Tentativa de requisição não autenticada a rotas privadas retorna 401. |
| TC-SEC-02 | RBAC | Escalonamento de Privilégio | Usuário CONSULTA não consegue excluir categorias nem alterar militares (403). |
| TC-SEC-03 | Auditoria | Integridade | Nenhuma mutação de cadastro é persistida sem log de auditoria associado. |
| TC-SEC-04 | Importação CSV | Sanitização | Arquivos CSV com caracteres de injeção de fórmula são neutralizados na exportação. |
| TC-SEC-05 | Relatórios | Renderização PDF | O PDF gerado inclui cabeçalho oficial do Estado de MT e marca d'água do Brasão CBMMT. |
| TC-FUNC-01 | Militares | Unicidade | Matrícula duplicada gera rejeição explícita com código 409 Conflict. |
| TC-FUNC-02 | Histórico | Busca Flexível | Busca por matrícula responde idêntica com ou sem barra (352112/02 == 352112). |
| TC-FUNC-03 | Alertas | Lógica Temporal | Militares com contrato a expirar em <= 30 dias recebem badge A_VENCER. |
`;

export default function PrdTestes() {
  const [copiado, setCopiado] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(PRD_RAW_CONTENT);
      setCopiado(true);
      toast.success("Especificação PRD copiada para a área de transferência!");
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error("Não foi possível copiar automaticamente.");
    }
  };

  const handleDownload = () => {
    downloadText("PRD_TESTES_AUTOMATIZADOS_CBMMT.md", PRD_RAW_CONTENT, "text/markdown;charset=utf-8");
    toast.success("Arquivo PRD_TESTES_AUTOMATIZADOS_CBMMT.md baixado com sucesso!");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1E2C42] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Engenharia de QA & Segurança</span>
            <span className="rounded bg-blue-500/10 px-2 py-0.5 font-mono text-[11px] text-blue-300 border border-blue-500/20">v2.4.0-PROD</span>
          </div>
          <h2 className="font-heading text-2xl font-extrabold text-white sm:text-3xl" data-testid="page-title">
            PRD para Testes Automatizados & Segurança
          </h2>
          <p className="mt-1 text-sm text-slate-400 max-w-3xl">
            Documento de requisitos técnicos estruturado para ingestão por agentes de testes automatizados (Playwright, Cypress, Postman/Newman) e scanners de vulnerabilidade (OWASP ZAP, Burp Suite, DAST/SAST).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleCopy}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 border-[#24344D] bg-[#121B28] text-slate-200 hover:bg-[#182335] hover:text-white")}
            title="Copiar especificação em Markdown para alimentar ferramentas de teste"
          >
            {copiado ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
            {copiado ? "Copiado!" : "Copiar Markdown"}
          </button>

          <button
            onClick={handleDownload}
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5 bg-gradient-to-r from-blue-700 to-indigo-700 font-semibold text-white shadow-md hover:from-blue-600 hover:to-indigo-600")}
            title="Baixar arquivo Markdown PRD_TESTES_AUTOMATIZADOS.md"
          >
            <Download className="size-4" />
            Baixar PRD (.md)
          </button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs defaultValue="visao-geral" className="space-y-5">
        <TabsList className="bg-[#121B28] border border-[#1E2C42] p-1 flex-wrap h-auto gap-1">
          <TabsTrigger value="visao-geral" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-white text-xs gap-1.5">
            <Layers className="size-3.5" /> Visão Geral & Arquitetura
          </TabsTrigger>
          <TabsTrigger value="rbac" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-white text-xs gap-1.5">
            <Lock className="size-3.5" /> Matriz RBAC
          </TabsTrigger>
          <TabsTrigger value="casos-teste" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-white text-xs gap-1.5">
            <FileCheck className="size-3.5" /> Casos de Teste (BDD)
          </TabsTrigger>
          <TabsTrigger value="seguranca" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-white text-xs gap-1.5">
            <ShieldAlert className="size-3.5" /> Segurança & OWASP
          </TabsTrigger>
          <TabsTrigger value="contratos-api" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-white text-xs gap-1.5">
            <Code2 className="size-3.5" /> Contratos de API
          </TabsTrigger>
          <TabsTrigger value="markdown" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-white text-xs gap-1.5">
            <FileText className="size-3.5" /> Markdown Completo
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Visão Geral */}
        <TabsContent value="visao-geral" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">Cliente / Órgão</span>
              <h3 className="mt-1 font-heading text-lg font-bold text-white">CBMMT / DGP</h3>
              <p className="mt-1 text-xs text-slate-400">Diretoria de Gestão de Pessoas do Corpo de Bombeiros Militar de Mato Grosso.</p>
            </div>
            <div className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Arquitetura de Testes</span>
              <h3 className="mt-1 font-heading text-lg font-bold text-white">Full-Stack E2E</h3>
              <p className="mt-1 text-xs text-slate-400">Interface SPA React 19 + API REST com persistência de dados e autenticação OAuth.</p>
            </div>
            <div className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Cobertura de Auditoria</span>
              <h3 className="mt-1 font-heading text-lg font-bold text-white">Imutabilidade 100%</h3>
              <p className="mt-1 text-xs text-slate-400">Toda mutação em cadastro, vencimento ou categoria gera log síncrono append-only.</p>
            </div>
          </div>

          <div className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-5 space-y-3">
            <h3 className="font-heading text-base font-bold text-white flex items-center gap-2">
              <Terminal className="size-4 text-blue-400" />
              Instruções de Ingestão para Ferramentas de Testes
            </h3>
            <p className="text-sm text-slate-300">
              Este PRD foi construído de forma determinística para ingestão por agentes de IA e frameworks de teste automatizados:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-400">
              <li><strong className="text-slate-200">Testes E2E (Playwright / Cypress)</strong>: Utilize os cenários em formato Gherkin na aba <em>Casos de Teste</em> para execução direta de fluxos de ponta a ponta.</li>
              <li><strong className="text-slate-200">Testes de Carga & API (Postman / k6)</strong>: Utilize a matriz de endpoints e contratos JSON para validar códigos de resposta (200, 201, 400, 401, 403, 409).</li>
              <li><strong className="text-slate-200">Scanners DAST (OWASP ZAP / Burp Suite)</strong>: Foque nos vetores de injeção de fórmulas CSV, escalonamento de privilégio de perfil e invariantes de auditoria.</li>
            </ul>
          </div>
        </TabsContent>

        {/* Tab 2: RBAC */}
        <TabsContent value="rbac" className="space-y-4">
          <div className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-5">
            <h3 className="font-heading text-base font-bold text-white mb-3">Matriz de Controle de Acesso por Endpoint</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1E2C42] text-slate-400">
                    <th className="py-2.5 pr-4">Método</th>
                    <th className="py-2.5 pr-4">Endpoint</th>
                    <th className="py-2.5 pr-4">Perfil Mínimo</th>
                    <th className="py-2.5">Resposta com Acesso Não Autorizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#162234] text-slate-300">
                  <tr>
                    <td className="py-2 pr-4 font-mono font-bold text-blue-400">GET</td>
                    <td className="py-2 pr-4 font-mono">/auth/me</td>
                    <td className="py-2 pr-4">Autenticado</td>
                    <td className="py-2 text-red-300">HTTP 401 Unauthorized</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono font-bold text-blue-400">GET</td>
                    <td className="py-2 pr-4 font-mono">/militares</td>
                    <td className="py-2 pr-4"><span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">CONSULTA</span></td>
                    <td className="py-2 text-red-300">HTTP 401 se deslogado</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono font-bold text-emerald-400">POST</td>
                    <td className="py-2 pr-4 font-mono">/militares</td>
                    <td className="py-2 pr-4"><span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300 border border-indigo-500/30">ADMIN</span></td>
                    <td className="py-2 text-amber-300">HTTP 403 Forbidden para CONSULTA</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono font-bold text-amber-400">PATCH</td>
                    <td className="py-2 pr-4 font-mono">/militares/:id/rapido</td>
                    <td className="py-2 pr-4"><span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300 border border-indigo-500/30">ADMIN</span></td>
                    <td className="py-2 text-amber-300">HTTP 403 Forbidden para CONSULTA</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono font-bold text-red-400">DELETE</td>
                    <td className="py-2 pr-4 font-mono">/catalogos/categorias/:id</td>
                    <td className="py-2 pr-4"><span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300 border border-indigo-500/30">ADMIN</span></td>
                    <td className="py-2 text-amber-300">HTTP 403 (ou 400 se possuir militares vinculados)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono font-bold text-blue-400">GET</td>
                    <td className="py-2 pr-4 font-mono">/auditoria</td>
                    <td className="py-2 pr-4"><span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300 border border-indigo-500/30">ADMIN</span></td>
                    <td className="py-2 text-amber-300">HTTP 403 Forbidden para CONSULTA</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Casos de Teste (BDD) */}
        <TabsContent value="casos-teste" className="space-y-4">
          <div className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-5 space-y-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Cenário BDD 01</span>
              <h4 className="font-heading text-base font-bold text-white">Validação de Unicidade de Matrícula (Prevenção de Duplicatas)</h4>
              <pre className="mt-2 overflow-x-auto rounded-lg border border-[#1E2C42] bg-[#0A0F18] p-3 text-xs text-emerald-300 font-mono">
{`Funcionalidade: Cadastro de Bombeiro Temporário
  Cenário: Tentativa de cadastro com matrícula já existente
    Dado que o usuário está autenticado com perfil "ADMIN"
    E já existe um militar com matrícula "352112/02"
    Quando o usuário tenta cadastrar um novo militar com matrícula "352112/02"
    Então o sistema deve recusar a operação com código HTTP 409
    E exibir a mensagem "Já existe cadastro para a matrícula 352112/02"`}
              </pre>
            </div>

            <div className="border-t border-[#1E2C42] pt-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">Cenário BDD 02</span>
              <h4 className="font-heading text-base font-bold text-white">Proteção Relacional na Exclusão de Categorias</h4>
              <pre className="mt-2 overflow-x-auto rounded-lg border border-[#1E2C42] bg-[#0A0F18] p-3 text-xs text-blue-300 font-mono">
{`Funcionalidade: Gerenciamento de Categorias de Cargos
  Cenário: Tentativa de exclusão de categoria com militares vinculados
    Dado que a categoria "CONDUTOR" possui militares ativos
    Quando o Administrador solicita a exclusão da categoria
    Então a operação deve ser rejeitada com código HTTP 400
    E a mensagem deve indicar a quantidade de militares ativos vinculados.`}
              </pre>
            </div>

            <div className="border-t border-[#1E2C42] pt-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Cenário BDD 03</span>
              <h4 className="font-heading text-base font-bold text-white">Busca Flexível de Histórico e Linha do Tempo Funcional</h4>
              <pre className="mt-2 overflow-x-auto rounded-lg border border-[#1E2C42] bg-[#0A0F18] p-3 text-xs text-amber-300 font-mono">
{`Funcionalidade: Emissão de Histórico Funcional por Matrícula
  Cenário: Busca de militar por dígitos puros sem barra
    Dado que o usuário acessa Relatórios > Histórico individual por matrícula
    Quando digita "352112" no campo de busca
    Então o sistema localiza "ABRAAO CAVALCANTE GAMBARRA (352112/02)"
    E compila a linha do tempo com Admissão, Vigência Contratual e Auditorias
    E o botão "Exportar PDF" gera documento oficial com o Brasão do CBMMT.`}
              </pre>
            </div>
          </div>
        </TabsContent>

        {/* Tab 4: Segurança & OWASP */}
        <TabsContent value="seguranca" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-red-500/20 bg-red-950/10 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-red-400" />
                <h4 className="font-bold text-white text-sm">A01: Broken Access Control</h4>
              </div>
              <p className="text-xs text-slate-300">
                Testes automatizados devem forçar requisições com token de perfil <code className="text-red-300">CONSULTA</code> em todas as rotas de mutação (<code className="text-slate-300">POST</code>, <code className="text-slate-300">PUT</code>, <code className="text-slate-300">PATCH</code>, <code className="text-slate-300">DELETE</code>). O resultado esperado é estritamente <strong className="text-red-200">HTTP 403 Forbidden</strong>.
              </p>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-amber-400" />
                <h4 className="font-bold text-white text-sm">A03: CSV Formula Injection</h4>
              </div>
              <p className="text-xs text-slate-300">
                Na importação e exportação de CSV/Excel, payloads como <code className="text-amber-300">=cmd|'/C calc'!A1</code> ou <code className="text-amber-300">+@SUM()</code> devem ser sanitizados para evitar execução remota de código em softwares de planilha do usuário.
              </p>
            </div>

            <div className="rounded-xl border border-blue-500/20 bg-blue-950/10 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Lock className="size-4 text-blue-400" />
                <h4 className="font-bold text-white text-sm">A02: Proteção de Credenciais</h4>
              </div>
              <p className="text-xs text-slate-300">
                Garantir que chamadas ao endpoint <code className="text-blue-300">GET /usuarios</code> nunca serializem os campos <code className="text-slate-300">senha</code> ou <code className="text-slate-300">senha_hash</code> na resposta JSON trafegada pela rede.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <FileCheck className="size-4 text-emerald-400" />
                <h4 className="font-bold text-white text-sm">A04: Imutabilidade de Auditoria</h4>
              </div>
              <p className="text-xs text-slate-300">
                Verificação de que nenhuma mutação em cadastro ocorre sem a inserção síncrona na coleção de auditoria. Nenhuma rota de exclusão de auditoria deve existir no sistema.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Tab 5: Contratos de API */}
        <TabsContent value="contratos-api" className="space-y-4">
          <div className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-5">
            <h3 className="font-heading text-base font-bold text-white mb-2">Esquema da Entidade Militar (TypeScript / JSON Schema)</h3>
            <pre className="overflow-x-auto rounded-lg border border-[#1E2C42] bg-[#0A0F18] p-4 text-xs text-cyan-300 font-mono">
{`interface Militar {
  id: string;                          // Identificador único (ex: "mil_1730000000")
  matricula: string;                   // Matrícula funcional institucional (ex: "352112/02")
  nome_completo: string;               // Nome completo em caixa alta
  cargo_id: string;                    // Foreign Key -> Cargo
  lotacao_id: string;                  // Foreign Key -> Lotação/UBM
  edital_id: string;                   // Foreign Key -> Edital
  data_inclusao: string;               // Formato ISO YYYY-MM-DD
  data_vencimento_contrato: string;    // Formato ISO YYYY-MM-DD
  status: "ATIVO" | "DESLIGADO";       // Estado funcional atual
  observacoes: string | null;          // Texto livre sanitizado
  doe_incorporacao: string | null;     // Diário Oficial do Estado (ex: "DOE nº 28.512")
  sub_judice: boolean;                 // Flag indicadora de decisão judicial
  data_desligamento: string | null;    // ISO YYYY-MM-DD se status == "DESLIGADO"
  motivo_desligamento_id: string | null;
  documento_desligamento: string | null; // Boletim Geral ou Portaria
  criado_em: string;                   // ISO 8601 Timestamp UTC
  atualizado_em: string;               // ISO 8601 Timestamp UTC
}`}
            </pre>
          </div>
        </TabsContent>

        {/* Tab 6: Markdown Completo */}
        <TabsContent value="markdown" className="space-y-4">
          <div className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2C42] mb-3">
              <span className="text-xs font-mono text-slate-400">Arquivo de Origem: /PRD_TESTES_AUTOMATIZADOS.md</span>
              <button
                onClick={handleCopy}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs gap-1 text-slate-300 hover:text-white")}
              >
                {copiado ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                {copiado ? "Copiado!" : "Copiar"}
              </button>
            </div>
            <pre className="max-h-[550px] overflow-auto rounded-lg border border-[#162234] bg-[#0A0F18] p-4 text-xs font-mono text-slate-300 whitespace-pre">
              {PRD_RAW_CONTENT}
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
