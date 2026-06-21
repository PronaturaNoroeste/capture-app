// Generic bridge: read a BuildInput-ish JSON from argv[2], print the RPC payload.
//   node --experimental-strip-types scripts/build_payload_cli.mjs input.json
// Used by the integration check to feed the real RPC with a real-form payload.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { buildPayload } from '../src/forms/buildPayload.ts';

const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const payload = buildPayload({ ...input, newId: () => randomUUID() });
process.stdout.write(JSON.stringify(payload));
