// Run with: npm test. The Earth's yearly totals in millions say one decimal at every size, as the film and the README's
// figure do: 2012's 19,491,829 is "19.5 million", not "19 million".
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { millions, wholeMillions } from './words.ts';

test('a yearly total in millions says one decimal above ten million too', () => {
  assert.equal(millions(19_491_829), '19.5 million');
  assert.equal(millions(4_573_073), '4.6 million');
  assert.equal(millions(21_480_000), '21.5 million');
  assert.equal(millions(16_240_000), '16.2 million');
});

test('a total on a whole million keeps its decimal; the grid lines say whole millions', () => {
  assert.equal(millions(24_000_400), '24.0 million');
  assert.equal(millions(5_012_000), '5.0 million');
  assert.equal(millions(250_000), '250,000');
  assert.equal(wholeMillions(10e6), '10 million');
  assert.equal(wholeMillions(20e6), '20 million');
});
