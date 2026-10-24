import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import { Lexer, Parser, Evaluator, data } from '@actions/expressions';

const action = parse(readFileSync(new URL('./action.yaml', import.meta.url), 'utf8'));
function evaluate(value, exact) {
  const inputs = new data.Dictionary({key: 'exact-key-only', value: new data.StringData(exact ?? action.inputs['exact-key-only']?.default ?? '')});
  const context = new data.Dictionary(
    {key: 'inputs', value: inputs},
    {key: 'runner', value: new data.Dictionary({key: 'os', value: new data.StringData('Linux')})},
  );
  return value.replace(/\$\{\{(.*?)\}\}/gs, (_, expression) => {
    const parsed = new Parser(new Lexer(expression).lex().tokens, ['inputs', 'runner'], [{name: 'hashFiles', minArgs: 1, maxArgs: 255}]).parse();
    return new Evaluator(parsed, context, new Map([['hashfiles', {name: 'hashFiles', minArgs: 1, maxArgs: 255, call: () => new data.StringData('dependency-hash')}]])).evaluate().coerceString();
  }).trim();
}

test('exact-key-only removes fallback keys and isolates both cache namespaces', () => {
  for (const [index, prefix] of [[0, 'go'], [1, 'golangci']]) {
    const cache = action.runs.steps[index].with;
    assert.equal(evaluate(cache['restore-keys'], 'true'), '');
    assert.equal(evaluate(cache.key, 'true'), `${prefix}-exact-v1-Linux-dependency-hash`);
  }
});

test('default and explicit false preserve existing cache keys and fallbacks', () => {
  for (const exact of [undefined, 'false']) {
    for (const [index, prefix] of [[0, 'go'], [1, 'golangci']]) {
      const cache = action.runs.steps[index].with;
      assert.equal(evaluate(cache.key, exact), `${prefix}-Linux-dependency-hash`);
      assert.equal(evaluate(cache['restore-keys'], exact), `${prefix}-Linux-`);
    }
  }
  assert.equal(action.inputs['exact-key-only'].default, 'false');
});
