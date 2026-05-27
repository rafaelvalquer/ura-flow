import {
  Braces,
  Code2,
  CornerDownRight,
  GitBranch,
  Globe2,
  KeyRound,
  LocateFixed,
  LogOut,
  Menu,
  MessageSquare,
  Milestone,
  PencilLine,
  Play,
  Repeat2,
  Split,
  Volume2,
  Workflow,
} from 'lucide-react';

export const DRAFT_STORAGE_KEY = 'ura-flow:nice-script:draft';
export const CLONES_STORAGE_KEY = 'ura-flow:nice-script:clones';
export const SNIPPET_THEME_STORAGE_KEY = 'ura-flow:nice-script:snippet-theme';

export const MANUAL_ACTION_TYPES = [
  'BEGIN',
  'SNIPPET',
  'PLAY',
  'RUNSCRIPT',
  'RUNSUB',
  'REST_API',
  'WORKFLOWDATA',
  'RETURN',
  'ANNOTATION',
  'IF',
  'LOOP',
  'MENU',
  'LOCATE',
  'CASE',
  'ASSIGN',
];

export const ACTION_PALETTE_GROUPS = [
  {
    key: 'entry',
    title: 'Entrada',
    accent: '#f59e0b',
    actions: ['BEGIN', 'MENU', 'PLAY'],
  },
  {
    key: 'routing',
    title: 'Roteamento',
    accent: '#0ea5e9',
    actions: ['LOCATE', 'CASE', 'IF', 'LOOP'],
  },
  {
    key: 'logic',
    title: 'Logica',
    accent: '#8b5cf6',
    actions: ['SNIPPET', 'ASSIGN', 'ANNOTATION'],
  },
  {
    key: 'integration',
    title: 'Integracoes',
    accent: '#06b6d4',
    actions: ['RUNSUB', 'REST_API', 'WORKFLOWDATA'],
  },
  {
    key: 'output',
    title: 'Saidas',
    accent: '#64748b',
    actions: ['RUNSCRIPT', 'RETURN'],
  },
];

export const ACTION_PALETTE_META = {
  BEGIN: { icon: Play, description: 'Inicio do script e variaveis de entrada.' },
  MENU: { icon: Menu, description: 'Coleta DTMF, audio e timeout.' },
  PLAY: { icon: Volume2, description: 'Executa audio ou prompt.' },
  LOCATE: { icon: LocateFixed, description: 'Valida resposta dentro da mascara.' },
  CASE: { icon: Split, description: 'Roteia por opcao ou valor.' },
  IF: { icon: GitBranch, description: 'Regra com saidas True e False.' },
  LOOP: { icon: Repeat2, description: 'Controle de repeticao, SIL ou REJ.' },
  SNIPPET: { icon: Code2, description: 'Logica customizada NICE.' },
  ASSIGN: { icon: PencilLine, description: 'Atribuicao simples de variavel.' },
  ANNOTATION: { icon: MessageSquare, description: 'Nota visual no fluxo.' },
  RUNSUB: { icon: Workflow, description: 'Chama subscript/API e recebe retorno.' },
  REST_API: { icon: Globe2, description: 'Chamada HTTP com request/response.' },
  WORKFLOWDATA: { icon: KeyRound, description: 'Busca chaves e configuracoes.' },
  RUNSCRIPT: { icon: CornerDownRight, description: 'Envia para proximo fluxo/script.' },
  RETURN: { icon: LogOut, description: 'Finaliza retorno do script.' },
};

export const SNIPPET_VARIABLES = [
  'NEXT_STEP',
  'AUDIO',
  'MRES',
  'OP_ESCOLHIDA',
  'scriptpoint',
  'MAPA_DNA',
  '{pathStep}',
  '{pathAPI}',
  '{path_audio}',
];

export const SNIPPET_BLOCKS = [
  {
    title: 'IF / ELSE',
    description: 'Estrutura condicional padrao.',
    code: 'IF NOME_VARIAVEL = "VALOR"\r\n{\r\n  \r\n}\r\nELSE\r\n{\r\n  \r\n}',
  },
  {
    title: 'SWITCH OP_ESCOLHIDA',
    description: 'Escolha por opcao digitada.',
    code: 'SWITCH OP_ESCOLHIDA\r\n{\r\n  CASE "1"\r\n  {\r\n    \r\n  }\r\n}',
  },
  {
    title: 'CASE "1"',
    description: 'Novo bloco CASE.',
    code: 'CASE "1"\r\n{\r\n  \r\n}',
  },
  {
    title: 'ASSIGN variavel',
    description: 'Atribuicao simples.',
    code: 'ASSIGN NOME_VARIAVEL="VALOR"',
  },
  {
    title: 'SET AUDIO + NEXT_STEP',
    description: 'Parametros principais de saida.',
    code: 'ASSIGN AUDIO="AUDIO.wav"\r\nASSIGN NEXT_STEP="{pathStep}Destino"\r\ninteractionLastDateTime=0',
  },
  {
    title: 'SET scriptpoint + MAPA_DNA',
    description: 'Rastreio de scriptpoint.',
    code: 'ASSIGN scriptpoint=0\r\nASSIGN MAPA_DNA="{MAPA_DNA}|{scriptpoint}"',
  },
  {
    title: 'SET TRANSFERCODE',
    description: 'Codigo de transferencia.',
    code: 'ASSIGN TRANSFERCODE="CODIGO.TRANSFER"',
  },
  {
    title: 'KeyTrace',
    description: 'Acumula opcao digitada.',
    code: 'ASSIGN global:KeyTrace="{KeyTrace}{MRES}"',
  },
  {
    title: 'Retorno API OK/ERRO',
    description: 'Trata retorno de API.',
    code: 'IF global:api_RET = "OK"\r\n{\r\n  ASSIGN NEXT_STEP="{pathStep}Sucesso"\r\n}\r\nELSE\r\n{\r\n  ASSIGN NEXT_STEP="{pathStep}Erro"\r\n}',
  },
  {
    title: 'Saida Transfer',
    description: 'Saida padrao para transferencia.',
    code: 'ASSIGN scriptpoint=0\r\nASSIGN MAPA_DNA="{MAPA_DNA}|{scriptpoint}"\r\nASSIGN AUDIO="PME_Transfer_ATH.wav"\r\nASSIGN NEXT_STEP="{pathStep}transfer"\r\nASSIGN TRANSFERCODE="TRANSFER.CODE"\r\ninteractionLastDateTime=0',
  },
  {
    title: 'Saida Tchau',
    description: 'Saida padrao de encerramento.',
    code: 'ASSIGN scriptpoint=0\r\nASSIGN MAPA_DNA="{MAPA_DNA}|{scriptpoint}"\r\nASSIGN AUDIO="PCI_Tchau.wav"\r\nASSIGN NEXT_STEP="{pathStep}Tchau"\r\ninteractionLastDateTime=0',
  },
  {
    title: 'Menu opcao escolhida',
    description: 'Normaliza resposta do menu.',
    code: 'OP_ESCOLHIDA="{mres}"\r\nASSIGN global:KeyTrace="{KeyTrace}{MRES}"',
  },
];
