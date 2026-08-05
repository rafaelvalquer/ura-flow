# URA Flow Desktop

Camada Electron usada para executar o frontend Vite como uma aplicação Windows.

## Preparação

Na raiz do repositório:

```bash
npm install
npm run desktop:install
```

## Executar em modo desktop

```bash
npm run desktop:start
```

Esse comando gera o build Vite, copia `dist` para `desktop/app/dist` e abre a janela Electron.

## Gerar instalador Windows

Em uma máquina Windows:

```bash
npm run package:win
```

O instalador será criado em:

```text
desktop/release/URA-Flow-Setup-0.1.0.exe
```

Também é possível executar manualmente o workflow **Build Windows Desktop** no GitHub Actions. O resultado será publicado como o artefato `ura-flow-windows-installer`.

## Arquivos gerados

As pastas abaixo não devem ser versionadas:

```text
dist/
desktop/app/
desktop/release/
```

## Arquitetura

O Electron inicia um servidor HTTP apenas em `127.0.0.1`, usando uma porta livre, e carrega o frontend compilado por essa URL. Essa abordagem mantém compatibilidade com Web Workers, módulos ES e assets produzidos pelo Vite.
