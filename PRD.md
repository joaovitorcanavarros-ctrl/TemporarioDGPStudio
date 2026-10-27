# Product Requirements Document (PRD) — Especificação Técnica para Testes Automatizados e Auditoria de Segurança

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
  - Servidor Node.js / Express integrado (`server.ts` ou handler REST com persistência de dados em Firestore e armazenamento local de sessão).
  - Firebase Authentication com suporte a Provedor Google OAuth (`signInWithPopup`).
- **Padrão de Comunicação**: RESTful JSON via métodos `GET`, `POST`, `PUT`, `PATCH` e `DELETE`.
- **Geração de Arquivos**:
  - Exportação de documentos oficiais em PDF institucional com marca d'água do Brasão CBMMT via `jspdf` e `jspdf-autotable`.
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
| `GET` | `/auth/me` | Autenticado | HTTP `401 Unauthorized` |
| `POST` | `/auth/login` | Público | HTTP `401` com credenciais inválidas |
| `POST` | `/auth/google` | Público | HTTP `400` sem e-mail válido |
| `GET` | `/dashboard` | CONSULTA | HTTP `401` se não autenticado |
| `GET` | `/militares` | CONSULTA | HTTP `401` se não autenticado |
| `POST` | `/militares` | **ADMIN** | HTTP `403 Forbidden` se perfil CONSULTA |
| `GET` | `/militares/:id` | CONSULTA | HTTP `404 Not Found` se ID inexistente |
| `PATCH`| `/militares/:id/rapido` | **ADMIN** | HTTP `403 Forbidden` |
| `PUT` | `/militares/:id` | **ADMIN** | HTTP `403 Forbidden` |
| `POST` | `/militares/:id/desligar` | **ADMIN** | HTTP `403 Forbidden` |
| `POST` | `/militares/:id/reativar` | **ADMIN** | HTTP `403 Forbidden` |
| `GET` | `/relatorios/:tipo` | CONSULTA | HTTP `401` se não autenticado |
| `POST` | `/importacao/analisar` | **ADMIN** | HTTP `403 Forbidden` |
| `POST` | `/importacao/validar` | **ADMIN** | HTTP `403 Forbidden` |
| `POST` | `/importacao/aplicar` | **ADMIN** | HTTP `403 Forbidden` |
| `DELETE`| `/catalogos/categorias/:id` | **ADMIN** | HTTP `403 Forbidden` ou HTTP `400` se houver militares vinculados |
| `GET` | `/auditoria` | **ADMIN** | HTTP `403 Forbidden` para CONSULTA |

---

## 3. Especificação de Contratos de Dados (Data Contracts & APIs)

### 3.1 Entidade Militar
```typescript
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
```

### 3.2 Regras de Unicidade e Normalização de Matrícula
1. **Unicidade**: Nenhuma matrícula duplicada pode ser persistida.
2. **Matching Flexível**: Na busca de histórico, o sistema deve resolver com paridade as seguintes entradas equivalentes para a matrícula `352112/02`:
   - Digitação com barra: `"352112/02"`
   - Digitação apenas da base: `"352112"`
   - Digitação apenas numérica: `"35211202"`
   - Digitação com hífen: `"352112-02"`
   - Digitação com espaços: `" 352112 / 02 "`
   - Busca parcial por nome (ex: `"ABRAAO"`).

### 3.3 Regras de Vencimento e Alertas Contratuais
- **Alerta de Vencimento (`alerta`)**:
  - `A_VENCER`: Se `status == "ATIVO"` e a diferença entre hoje e `data_vencimento_contrato` estiver no intervalo $[0, 30\text{ dias}]$.
  - `VENCIDO`: Se `status == "ATIVO"` e a diferença for negativa ($< 0\text{ dias}$).
  - `null`: Contrato vigente com prazo $> 30\text{ dias}$ ou militar já desligado.

---

## 4. Casos de Teste Funcionais Automatizados (Cenários BDD / Gherkin)

### Cenário 1: Inclusão Manual de Militar com Validação de Matrícula Duplicada
```gherkin
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
```

### Cenário 2: Exclusão de Categorias com Proteção de Integridade Relacional
```gherkin
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
```

### Cenário 3: Consulta e Exportação de Histórico Funcional em PDF
```gherkin
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
```

---

## 5. Matriz de Testes de Segurança e Vetores de Vulnerabilidade (OWASP Top 10)

Esta seção orienta a configuração de ferramentas DAST (Dynamic Application Security Testing) e testes de penetração automatizados.

### 5.1 A01: Broken Access Control (Controle de Acesso Quebrado)
- **Vetor 1: Injeção de Parâmetros de Perfil no Login**
  - *Payload*: `POST /auth/google` enviando body modificado `{ email: "hacker@gmail.com", perfil: "ADMIN" }`.
  - *Comportamento Esperado*: O backend não deve aceitar o campo `perfil` enviado pelo cliente; o perfil deve ser determinado estritamente pelo cadastro do banco de dados ou lista restrita de administradores autorizados.
- **Vetor 2: Execução de Ações Administrativas por Usuário Consulta**
  - *Payload*: Executar `POST /militares`, `POST /militares/:id/desligar`, `DELETE /catalogos/categorias/:id` com sessão autenticada de usuário `CONSULTA`.
  - *Comportamento Esperado*: O sistema deve abortar imediatamente com `HTTP 403 Forbidden` e registrar tentativa de violação na auditoria.

### 5.2 A02: Cryptographic Failures & Sensitive Data Exposure (Exposição de Dados Sensíveis)
- **Vetor 1: Vazamento de Hash de Senha em APIs de Usuário**
  - *Endpoint*: `GET /usuarios`.
  - *Verificação*: Garantir que as propriedades `senha`, `senha_hash` ou segredos nunca sejam serializadas na resposta JSON enviada ao frontend.
- **Vetor 2: Proteção de Chaves e Credenciais no Bundle**
  - *Verificação*: Nenhuma chave de serviço privada (`private_key`, `client_secret`) pode estar exposta no código-fonte cliente JavaScript/Vite (`dist/assets/*.js`). Apenas identificadores públicos do cliente Firebase são permitidos.

### 5.3 A03: Injection & CSV Formula Injection (Injeção de Fórmulas e Comandos)
- **Vetor 1: CSV Formula Injection (Excel Macro Execution)**
  - *Cenário de Teste*: Cadastrar militar com nome ou observação iniciando por `=`, `+`, `-`, `@` (ex: `=cmd|'/C calc'!A1` ou `=HYPERLINK("http://malicioso.com")`).
  - *Comportamento Esperado*: Na exportação CSV (`exportFile` ou `toCsv`), caracteres especiais que disparam execução de fórmulas em softwares de planilha (Excel, LibreOffice) devem ser devidamente escapados com apóstrofo prefixado (`'`).
- **Vetor 2: Cross-Site Scripting (Stored XSS) em Campos Textuais**
  - *Payload*: `<script>alert(document.cookie)</script>`, `<img src=x onerror=alert(1)>` no campo `observacoes`, `nome_completo` ou `documento_desligamento`.
  - *Comportamento Esperado*: O React deve sanitizar a renderização no DOM prevenindo execução de script; na geração do PDF via `jspdf`, o texto deve ser impresso como string literal pura sem injeção de comandos de renderização.

### 5.4 A04: Insecure Design & Imutabilidade de Auditoria
- **Vetor 1: Violação da Trilha de Auditoria (Audit Tampering)**
  - *Regra de Negócio*: Toda e qualquer alteração de estado (novo cadastro, edição de data de vencimento, desligamento, reativação, exclusão de categoria) DEVE gerar um registro síncrono em `store.alteracoes`.
  - *Teste de Invariante*: Disparar uma mutação e verificar se o total de registros de auditoria incrementou exatamente em $+1$.
  - *Teste de Deleção*: Nenhuma rota `DELETE /auditoria` ou `DELETE /auditoria/:id` deve existir no backend. Registros de auditoria são legalmente permanentes.

### 5.5 A05: Security Misconfiguration & Rate Limiting
- **Vetor 1: Tratamento de Erros e Stack Trace Leakage**
  - *Teste*: Enviar JSON malformado para rotas `POST` e verificar se a resposta de erro contém traces de servidor, caminhos absolutos do sistema operacional (`/app/applet/...`) ou credenciais de banco.
  - *Comportamento Esperado*: Mensagem de erro em formato padronizado `{ detail: "Mensagem amigável" }`.

---

## 6. Checklist de Validação para Ferramentas Automatizadas

| ID do Teste | Módulo | Tipo de Teste | Critério de Sucesso |
| :--- | :--- | :--- | :--- |
| **TC-SEC-01** | Autenticação | DAST / Auth | Tentativa de requisição não autenticada a rotas privadas retorna `401`. |
| **TC-SEC-02** | RBAC | Escalonamento de Privilégio | Usuário `CONSULTA` não consegue excluir categorias nem alterar militares (`403`). |
| **TC-SEC-03** | Auditoria | Integridade | Nenhuma mutação de cadastro é persistida sem log de auditoria associado. |
| **TC-SEC-04** | Importação CSV | Sanitização | Arquivos CSV com caracteres de injeção de fórmula são neutralizados na exportação. |
| **TC-SEC-05** | Relatórios | Renderização PDF | O PDF gerado inclui cabeçalho oficial do Estado de MT e marca d'água do Brasão CBMMT. |
| **TC-FUNC-01**| Militares | Unicidade | Matrícula duplicada gera rejeição explícita com código `409 Conflict`. |
| **TC-FUNC-02**| Histórico | Busca Flexível | Busca por matrícula responde idêntica com ou sem barra (`352112/02` == `352112`). |
| **TC-FUNC-03**| Alertas | Lógica Temporal | Militares com contrato a expirar em $\le 30$ dias recebem badge `A_VENCER`. |
