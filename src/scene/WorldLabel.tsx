import { useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';

/** Wait for the canvas and suspended environment to commit before creating Html's
 * separate DOM root. Otherwise the first label can be detached on initial entry. */
export function WorldLabel(props: ComponentProps<typeof Html>) {
  const frames = useRef(0);
  const [ready, setReady] = useState(false);
  useFrame(() => {
    if (++frames.current === 3) setReady(true);
  });
  return ready ? <Html {...props} /> : null;
}
