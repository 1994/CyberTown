import { sharedGeometry } from './sharedGeometry.ts';
import type { GeometryArgs, GeometryKind } from './sharedGeometry.ts';

type Props = { [K in GeometryKind]: { kind: K; args: GeometryArgs[K] } }[GeometryKind];
export function SharedGeometry({ kind, args }: Props) {
  return <primitive object={sharedGeometry(kind, args)} attach="geometry" dispose={null} />;
}
