import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STORY, partFill, partState, storyLabels } from './story.ts';
import { entryTitle } from './words.ts';

test('the story runs from the world to the live predictions', () => {
  assert.deepEqual([...STORY], ['world', 'jump', 'place', 'fire', 'tested', 'live']);
});

test('labels that hold a figure take it from the data and are plain without it', () => {
  const plain = storyLabels();
  assert.equal(plain.jump, 'The jump');
  assert.equal(plain.tested, 'Tested fires');
  const data = storyLabels({ jumpYear: 2012, testedFires: 57 });
  assert.equal(data.jump, '2012');
  assert.equal(data.tested, '57 fires');
});

test('parts before the current one are done, the current is on, the rest ahead', () => {
  assert.equal(partState('world', 'fire'), 'done');
  assert.equal(partState('fire', 'fire'), 'on');
  assert.equal(partState('live', 'fire'), 'ahead');
  assert.equal(partState('world', null), 'ahead');
});

test('the current part fills by its progress, clamped, and is whole when not playing', () => {
  assert.equal(partFill(0.4), 0.4);
  assert.equal(partFill(-1), 0);
  assert.equal(partFill(3), 1);
  assert.equal(partFill(null), 1);
});

test('the entry title names the record years from the data', () => {
  assert.equal(entryTitle(2000, 2025), 'Fire on Earth, 2000 to 2025');
  assert.equal(entryTitle(null, 2025), 'Fire on Earth');
});
