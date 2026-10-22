import { LocalPointLight } from './LocalLights';

// Local bounced light only: leave unlit surfaces dark instead of painting a
// luminous overlay over the road. All sources share the existing light budget.
const SPILLS: [number, number, string][] = [
  [-19, 1, '#e798bb'], [-24, 10, '#ffc286'], [-14, 13, '#8ddcea'],
  [-5, 11, '#95d7d4'], [5, 11, '#e8bc86'], [15, 10, '#d996db'],
  [23, 11, '#8bd9ed'], [24, -5, '#baace7'], [-58, -16, '#eab987'],
  [-74, 16, '#9bd4cb'], [60, -16, '#d49cc7'], [82, 18, '#a4cfe8'],
];

export function NeonStreetLight() {
  return <group name="neon-street-spill">
    {SPILLS.map(([x, z, color]) => <LocalPointLight key={`${x}:${z}`}
      position={[x, 3.5, z]} color={color} intensity={24} distance={10} decay={2} />)}
  </group>;
}
