import assert from 'node:assert/strict';
import {
  addChildRuleToState,
  addRootRuleToState,
  createProjectFromParsedData,
  indentRuleInState,
  outdentRuleInState,
  projectToParsedData,
  updateRuleInState,
  validateProject,
} from '../src/services/specEditorProject.js';

const parsed = {
  fileName: 'SpecTeste.xlsx',
  sheetNames: ['Entrada', 'Menu'],
  diagnostics: { warnings: [] },
  states: [
    {
      sheetName: 'Entrada',
      audioCatalog: [{ fileName: 'Entrada_INI', text: 'Bem-vindo' }],
      transitions: [
        {
          id: 'entrada-10',
          from: 'Entrada',
          to: 'Menu',
          conditions: ['Cliente identificado?', 'Sim'],
          prompt: 'Entrada_INI',
          observation: '',
          bi: '100 - Entrada',
          rowNumber: 10,
        },
      ],
      decisionTree: [
        {
          id: 'cond-1',
          text: 'Cliente identificado?',
          rowNumber: 9,
          children: [
            {
              id: 'cond-2',
              text: 'Sim',
              rowNumber: 10,
              destination: 'Menu',
              prompt: 'Entrada_INI',
              bi: '100 - Entrada',
              transitionId: 'entrada-10',
              children: [],
            },
          ],
        },
      ],
    },
    {
      sheetName: 'Menu',
      audioCatalog: [],
      transitions: [{ id: 'menu-1', from: 'Menu', to: 'Tchau', conditions: [], prompt: '', observation: '', bi: '', rowNumber: 1 }],
      decisionTree: [],
    },
  ],
};

let project = createProjectFromParsedData(parsed);
assert.equal(project.states.length, 2);
assert.equal(project.states[0].rules[0].children[0].destination, 'Menu');
assert.equal(validateProject(project).counts.error, 0);

const stateId = project.states[0].id;
project = addRootRuleToState(project, stateId, 'IF').project;
const root = project.states[0].rules.at(-1);
project = updateRuleInState(project, stateId, root.id, { result: 'Nova condição' });
project = addChildRuleToState(project, stateId, root.id).project;
assert.equal(project.states[0].rules.at(-1).children.length, 1);

const secondRootId = project.states[0].rules[1].id;
project = indentRuleInState(project, stateId, secondRootId);
assert.equal(project.states[0].rules.length, 1);
assert.ok(project.states[0].rules[0].children.some((rule) => rule.id === secondRootId));
project = outdentRuleInState(project, stateId, secondRootId);
assert.equal(project.states[0].rules.length, 2);

const rebuilt = projectToParsedData(project);
assert.equal(rebuilt.states.length, 2);
assert.ok(rebuilt.states[0].transitions.some((transition) => transition.to === 'Menu'));
console.log('specEditorProject tests: OK');
