import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef, useMemo } from "react";
import * as THREE from "three";

const SIDE = 2.0;
const HALF = SIDE / 2;

function GlassCube({ score }: { score: number }) {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.35;
  });

  const s          = Math.max(0, Math.min(100, score));
  const fillRatio  = s / 100;
  const fillHeight = SIDE * fillRatio;
  const fillScaleY = Math.max(fillRatio, 0.0001);
  const fillPosY   = -HALF + fillHeight / 2;

  const boxGeo  = useMemo(() => new THREE.BoxGeometry(SIDE, SIDE, SIDE), []);
  const edgeGeo = useMemo(() => new THREE.EdgesGeometry(boxGeo), [boxGeo]);

  return (
    <group ref={groupRef}>
      <mesh geometry={boxGeo}>
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.06}
          roughness={0}
          metalness={0}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <lineSegments geometry={edgeGeo}>
        <lineBasicMaterial color="#000000" transparent opacity={0.7} />
      </lineSegments>

      {s > 0 && (
        <mesh
          geometry={boxGeo}
          scale={[1, fillScaleY, 1]}
          position={[0, fillPosY, 0]}
        >
          <meshBasicMaterial color="#090909" />
        </mesh>
      )}
    </group>
  );
}

export default function LiquidHexScene({ score }: { score: number }) {
  return (
    <Canvas
      camera={{ position: [3.2, 2.4, 3.2], fov: 42 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#ffffff"]} />

      <ambientLight intensity={0.4} />
      <pointLight position={[4, 6, 4]}   intensity={8}  color="#ffffff" />
      <pointLight position={[-4, 3, -2]} intensity={3}  color="#88aaff" />
      <pointLight position={[0, -3, 3]}  intensity={1.5} color="#ffffff" />

      <GlassCube score={score} />

      <OrbitControls enableZoom={false} enablePan={false} />
    </Canvas>
  );
}
