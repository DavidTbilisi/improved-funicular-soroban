import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cubeFacesForDigit, cubeEmojis, cubeName } from '../src/domain/faces.js';
import { matrixCell, hexCell, packAction, actionParticiple } from '../src/domain/codec/cell.js';
import { deepPackScenes, sceneStory, padHex } from '../src/domain/codec/scene.js';
import { sealDigit, sealHex, DECIMAL_CODEC, HEX_CODEC, codecForRadix } from '../src/domain/codec/codec.js';

test('cube face grammar: 0 bare, 5 rose alone, 6-9 rose + earth', () => {
  assert.deepEqual(cubeFacesForDigit(0), []);
  assert.equal(cubeName(0), 'bare column');
  assert.equal(cubeName(5), 'Rose');
  assert.equal(cubeName(8), 'Rose + Alien');
  assert.equal(cubeEmojis(8), '🌹👽');
});

test('matrixCell maps tens→audio, units→visual', () => {
  const c = matrixCell(12);
  assert.equal(c.name, 'Sun-Swan');
  assert.equal(c.tens, 1);
  assert.equal(c.units, 2);
});

test('hexCell pairs high/low nibble pegs', () => {
  const c = hexCell(10, 15);
  assert.equal(c.hexStr, 'AF');
  assert.equal(c.name, 'Alpha-Flag');
});

test('packAction: 0 = contact, 6-9 = flaming +5', () => {
  assert.equal(packAction(0).emoji, '🤝');
  assert.equal(packAction(0).flaming, false);
  const a7 = packAction(7);
  assert.equal(a7.flaming, true);
  assert.equal(a7.name, 'flaming splatter');
  assert.equal(actionParticiple(3), 'is abducted');
});

test('deepPackScenes chunks by 5 with partial-tail grammar', () => {
  assert.equal(deepPackScenes('1234567890').length, 2);
  const partial = deepPackScenes('12')[0];
  assert.equal(partial.partial, true);
  assert.equal(sceneStory(partial), 'the Sun-Swan (12)');
  assert.equal(sceneStory(deepPackScenes('7')[0]), 'Rose + Tangerine (7)');
});

test('seals: digit-sum mod 9 (0→9), nibble-sum mod 15 (0→F)', () => {
  assert.equal(sealDigit('123456789'), 9); // sum 45, 45%9=0 → 9
  assert.equal(sealDigit('10'), 1);
  assert.equal(sealHex('FF'), 15);          // 30 % 15 = 0 → 15 (F)
  assert.equal(sealHex('01'), 1);
});

test('padHex left-pads odd-length strings', () => {
  assert.equal(padHex('F'), '0F');
  assert.equal(padHex('FF'), 'FF');
});

test('DecimalCodec.prepare packs digits + seals a locus', () => {
  const { code, unitCount, unitNoun, loci } = DECIMAL_CODEC.prepare(12345, '');
  assert.equal(code, '12345');
  assert.equal(unitCount, 5);
  assert.equal(unitNoun, 'digit');
  assert.equal(loci.length, 1);
  assert.equal(loci[0].seal, sealDigit('12345'));
});

test('DecimalCodec.prepare is empty for zero with no fraction', () => {
  assert.equal(DECIMAL_CODEC.prepare(0, '').code, '');
  assert.equal(DECIMAL_CODEC.prepare(0, '').loci.length, 0);
});

test('HexCodec.prepare packs bytes and ignores the fraction', () => {
  const p = HEX_CODEC.prepare(255, '25');
  assert.equal(p.code, 'FF');
  assert.equal(p.unitNoun, 'byte');
  assert.equal(p.unitCount, 1);
  assert.equal(p.fractionIgnored, true);
  assert.equal(p.loci[0].seal, sealHex('FF'));
  assert.equal(HEX_CODEC.sealLabel(15), 'F');
});

test('codecForRadix selects the strategy', () => {
  assert.equal(codecForRadix(10), DECIMAL_CODEC);
  assert.equal(codecForRadix(16), HEX_CODEC);
});
