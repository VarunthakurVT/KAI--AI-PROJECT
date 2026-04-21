import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useUIStore } from '../../shared/store/useUIStore';
import { KnowledgeNode } from '../../shared/types';

function Node({ node, allNodes }: { node: KnowledgeNode; allNodes: KnowledgeNode[] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  
  const color = useMemo(() => {
    if (node.mastery >= 80) return '#22c55e';
    if (node.mastery >= 60) return '#f59e0b';
    if (node.mastery >= 40) return '#3b82f6';
    return '#6b7280';
  }, [node.mastery]);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y = node.position[1] + Math.sin(state.clock.elapsedTime + node.position[0]) * 0.1;
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2) * 0.1);
    }
  });

  const connections = useMemo(() => {
    return node.connections.map((connId) => {
      const target = allNodes.find((n) => n.id === connId);
      if (!target) return null;
      return {
        points: [
          new THREE.Vector3(...node.position),
          new THREE.Vector3(...target.position),
        ],
      };
    }).filter(Boolean);
  }, [node, allNodes]);

  return (
    <group>
      {connections.map((conn, i) => (
        <Line
          key={i}
          points={conn!.points}
          color="#334155"
          lineWidth={1}
          opacity={0.5}
          transparent
        />
      ))}
      
      <mesh ref={glowRef} position={node.position}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.15} />
      </mesh>
      
      <mesh ref={meshRef} position={node.position}>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          roughness={0.3}
          metalness={0.7}
        />
      </mesh>
      
      <Text
        position={[node.position[0], node.position[1] - 0.5, node.position[2]]}
        fontSize={0.2}
        color="#94a3b8"
        anchorX="center"
        anchorY="top"
      >
        {node.label}
      </Text>
      
      <Text
        position={[node.position[0], node.position[1] + 0.45, node.position[2]]}
        fontSize={0.15}
        color={color}
        anchorX="center"
        anchorY="bottom"
      >
        {node.mastery}%
      </Text>
    </group>
  );
}

function Scene() {
  const { knowledgeNodes } = useUIStore();
  
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#f59e0b" />
      
      {knowledgeNodes.map((node) => (
        <Node key={node.id} node={node} allNodes={knowledgeNodes} />
      ))}
      
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        autoRotate
        autoRotateSpeed={0.5}
        minDistance={3}
        maxDistance={15}
      />
    </>
  );
}

export function MasteryMap3D() {
  return (
    <div className="absolute inset-0 bg-slate-950">
      <Canvas camera={{ position: [5, 3, 5], fov: 60 }}>
        <Scene />
      </Canvas>
    </div>
  );
}
