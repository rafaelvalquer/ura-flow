# URA Flow — Editor Beta de SPECs

Esta entrega adiciona uma terceira aba ao `ura-flow` sem remover ou substituir as funcionalidades existentes:

- **Spec Excel**: permanece igual.
- **Editor Beta**: nova área editável com persistência local.
- **Script NICE**: permanece igual.

## Instalação automática

1. Faça um backup ou commit do seu repositório atual.
2. Extraia o ZIP.
3. Execute o instalador informando a raiz do `ura-flow`:

```bash
node install-spec-editor-beta.mjs C:\caminho\para\ura-flow
```

No Linux/macOS:

```bash
node install-spec-editor-beta.mjs /caminho/para/ura-flow
```

Também é possível copiar o conteúdo do ZIP para a raiz do repositório e executar:

```bash
node install-spec-editor-beta.mjs
```

O instalador:

- copia somente os novos componentes, serviços e estilos;
- cria `src/App.jsx.before-spec-editor-beta.bak`;
- aplica quatro alterações pequenas em `src/App.jsx`;
- não altera `package.json`, pois não há dependências novas.

Depois:

```bash
npm install
npm run dev
```

## Instalação manual

Copie:

```text
src/components/spec-editor/
src/services/specEditorProject.js
src/services/specEditorStorage.js
src/styles/spec-editor.css
```

Depois aplique `patches/App.jsx.patch` ou faça as quatro alterações descritas nele.

## Funcionalidades entregues

- Importação XLSX/XLS/XLSM pelo parser existente do `ura-flow`.
- Reaproveitamento do Web Worker de leitura da SPEC.
- Conversão de `decisionTree` e `transitions` em regras editáveis.
- Linhas hierárquicas expansíveis e recolhíveis.
- Classificação visual `IF`, `ELSE IF`, `ELSE`, `CASO`, `AÇÃO` e `DIRETIVA`.
- Edição das colunas:
  - Resultado.
  - Vai para o estado...
  - E ouve o prompt...
  - Observação.
  - Marcação de B.I.
- Destinos internos clicáveis para abrir o estado correspondente.
- Inclusão, exclusão, duplicação, movimentação, indentação e desindentação de regras.
- Inclusão, duplicação, renomeação e exclusão de estados.
- Catálogo editável de áudios e prompts.
- Visualização de fluxo reutilizando `FlowCanvas` e `buildFlow` existentes.
- Validação de destinos, prompts e regras incompletas.
- Autosave com debounce no `localStorage`.
- Lista de projetos recentes.
- Backup e restauração em JSON.
- Atalho `Ctrl+S` para forçar salvamento local.

## Limitações conscientes da Beta

- O `localStorage` possui limite definido pelo navegador.
- O arquivo XLSX original não é armazenado; apenas o modelo normalizado é salvo.
- A hierarquia de IF/ELSE é documental e editável, não executa JavaScript.
- A exportação de volta para XLSX não está incluída nesta entrega.
- Não há usuários, colaboração ou auditoria centralizada.

## Teste do modelo

O pacote inclui um teste sem dependências externas:

```bash
node tests/specEditorProject.test.mjs
```

## Reversão

Para remover a integração:

1. Restaure `src/App.jsx.before-spec-editor-beta.bak` como `src/App.jsx`.
2. Remova os diretórios e arquivos adicionados listados em “Instalação manual”.
