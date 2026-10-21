// Regenerate with --write after map/belt changes. CI rejects stale CLI observations.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { WORLD_BOUNDS, BOXES, CIRCLES, ZONES, PLAYER_RADIUS, WALK_SPEED } from '../shared/world.ts';
import { BELT_ZONE } from '../src/ui/beltAnimation.ts';
const path = new URL('../gameplay/navigation.json', import.meta.url);
const contract = { bounds: WORLD_BOUNDS, boxes: BOXES, circles: CIRCLES, zones: ZONES, playerRadius: PLAYER_RADIUS, walkSpeed: WALK_SPEED, beltZone: BELT_ZONE };
if (process.argv.includes('--write')) writeFileSync(path, JSON.stringify(contract) + '\n');
else assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), contract, 'CLI map/belt contract stale: node scripts/export-player-contract.ts --write');
console.log('CLI map, collision, movement and belt windows match the web player.');
