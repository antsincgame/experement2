import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import {
  Pause, Play, Eye, EyeOff, UserPlus, UserMinus, Zap, ArrowLeft,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';

import type { SimulationState, AgentRole } from '../types';
import { ALL_ROLES, ROLE_CONFIGS, GROUND_OFFSET } from '../constants';
import { createAgent, releaseAgentName, spawnInitialAgents } from '../simulation/agent-factory';
import { tick } from '../simulation/simulation-loop';
import { drawScene } from '../rendering/draw-scene';

const GLASS_BG = 'rgba(255, 255, 255, 0.65)';
const GLASS_BORDER = 'rgba(255, 255, 255, 0.8)';

export default function AgentScene() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<SimulationState>({
    agents: [],
    paused: false,
    groundY: 0,
    sceneWidth: 0,
    sceneHeight: 0,
    time: 0,
  });
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const containerRef = useRef<View | null>(null);

  const [paused, setPaused] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [agentCount, setAgentCount] = useState(0);
  const [selectedRole, setSelectedRole] = useState<AgentRole>('coder');
  const [tick_count, setTickCount] = useState(0);

  const showLabelsRef = useRef(showLabels);
  showLabelsRef.current = showLabels;

  const setupCanvas = useCallback((width: number, height: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    const groundY = height - GROUND_OFFSET;
    const sim = simRef.current;
    sim.sceneWidth = width;
    sim.sceneHeight = height;
    sim.groundY = groundY;

    if (sim.agents.length === 0) {
      sim.agents = spawnInitialAgents(width, groundY);
      setAgentCount(sim.agents.length);
    } else {
      for (const agent of sim.agents) {
        agent.y = Math.min(agent.y, groundY);
        if (agent.y >= groundY) {
          agent.y = groundY;
          agent.grounded = true;
        }
      }
    }
  }, []);

  const loop = useCallback((timestamp: number) => {
    if (lastTimeRef.current === 0) {
      lastTimeRef.current = timestamp;
    }

    const dt = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    const sim = simRef.current;
    tick(sim, dt);

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawScene(ctx, sim, showLabelsRef.current);
        ctx.restore();
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const container = document.getElementById('playground-canvas-container');
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.borderRadius = '16px';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setupCanvas(width, height);
        }
      }
    });

    resizeObserver.observe(container);
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
      canvasRef.current = null;
    };
  }, [setupCanvas, loop]);

  const handlePauseToggle = useCallback(() => {
    const next = !simRef.current.paused;
    simRef.current.paused = next;
    setPaused(next);
  }, []);

  const handleToggleLabels = useCallback(() => {
    setShowLabels((prev) => !prev);
  }, []);

  const handleSpawnAgent = useCallback(() => {
    const sim = simRef.current;
    if (sim.agents.length >= 15) return;
    const agent = createAgent(selectedRole, sim.sceneWidth, sim.groundY);
    sim.agents.push(agent);
    setAgentCount(sim.agents.length);
  }, [selectedRole]);

  const handleRemoveAgent = useCallback(() => {
    const sim = simRef.current;
    if (sim.agents.length <= 1) return;
    const removed = sim.agents.pop();
    if (removed) releaseAgentName(removed.name);
    setAgentCount(sim.agents.length);
  }, []);

  const handleTriggerJump = useCallback(() => {
    for (const agent of simRef.current.agents) {
      if (agent.grounded) {
        agent.currentState = 'jumping';
        agent.vy = -9;
        agent.grounded = false;
      }
    }
  }, []);

  // Periodic UI sync for agent statuses
  useEffect(() => {
    const interval = setInterval(() => {
      setTickCount((c) => c + 1);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const agentList = useMemo(() => {
    void tick_count;
    return simRef.current.agents.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      color: a.color,
      currentState: a.currentState,
      statusText: a.statusText,
    }));
  }, [tick_count]);

  if (Platform.OS !== 'web') {
    return (
      <View className="flex-1 items-center justify-center bg-holo-bg">
        <Text className="text-ink-muted text-base">Agent Playground is available on web only</Text>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#F0F0FF' }}>
      {/* Top bar */}
      <View
        className="flex-row items-center px-4 gap-3"
        style={{ height: 52 }}
      >
        <Pressable
          onPress={() => router.back()}
          className="w-9 h-9 rounded-xl items-center justify-center"
          style={{
            backgroundColor: GLASS_BG,
            borderWidth: 1,
            borderColor: GLASS_BORDER,
          }}
        >
          <ArrowLeft size={16} color="#4A4A6A" strokeWidth={1.5} />
        </Pressable>
        <Text className="text-ink-dark text-lg font-bold tracking-tight">
          Agent Playground
        </Text>
        <View className="flex-1" />
        <Text className="text-ink-muted text-xs">
          {agentCount} agents
        </Text>
      </View>

      <View className="flex-1 flex-row">
        {/* Canvas area */}
        <View className="flex-1 m-3 mr-0 rounded-2xl overflow-hidden" style={{ backgroundColor: '#E8F0FE' }}>
          <View
            nativeID="playground-canvas-container"
            className="flex-1"
          />
        </View>

        {/* Control panel */}
        <View
          className="m-3 rounded-2xl p-3"
          style={{
            width: 220,
            backgroundColor: GLASS_BG,
            borderWidth: 1,
            borderColor: GLASS_BORDER,
            ...(Platform.OS === 'web' ? { backdropFilter: 'blur(16px)' } as never : {}),
          }}
        >
          {/* Action buttons */}
          <View className="gap-2 mb-3">
            <Text className="text-ink-muted text-xs font-semibold uppercase tracking-wider mb-1">
              Controls
            </Text>

            <View className="flex-row gap-2">
              <ControlButton
                onPress={handlePauseToggle}
                icon={paused ? <Play size={14} color="#00E5FF" /> : <Pause size={14} color="#4A4A6A" />}
                label={paused ? 'Play' : 'Pause'}
                active={paused}
              />
              <ControlButton
                onPress={handleToggleLabels}
                icon={showLabels ? <Eye size={14} color="#4A4A6A" /> : <EyeOff size={14} color="#4A4A6A" />}
                label="Labels"
              />
            </View>

            <View className="flex-row gap-2">
              <ControlButton
                onPress={handleSpawnAgent}
                icon={<UserPlus size={14} color="#00FF88" />}
                label="Spawn"
              />
              <ControlButton
                onPress={handleRemoveAgent}
                icon={<UserMinus size={14} color="#FF3366" />}
                label="Remove"
              />
            </View>

            <ControlButton
              onPress={handleTriggerJump}
              icon={<Zap size={14} color="#FFD700" />}
              label="Jump All!"
              fullWidth
            />
          </View>

          {/* Role selector */}
          <View className="mb-3">
            <Text className="text-ink-muted text-xs font-semibold uppercase tracking-wider mb-1.5">
              Spawn Role
            </Text>
            <View className="flex-row flex-wrap gap-1">
              {ALL_ROLES.map((role) => (
                <Pressable
                  key={role}
                  onPress={() => setSelectedRole(role)}
                  className="px-2 py-1 rounded-lg"
                  style={{
                    backgroundColor: selectedRole === role
                      ? ROLE_CONFIGS[role].color + '22'
                      : 'rgba(0,0,0,0.03)',
                    borderWidth: 1,
                    borderColor: selectedRole === role
                      ? ROLE_CONFIGS[role].color + '44'
                      : 'transparent',
                  }}
                >
                  <Text
                    className="text-xs font-medium"
                    style={{ color: selectedRole === role ? ROLE_CONFIGS[role].color : '#888' }}
                  >
                    {role}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Agent list */}
          <Text className="text-ink-muted text-xs font-semibold uppercase tracking-wider mb-1.5">
            Agents
          </Text>
          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            {agentList.map((agent) => (
              <View
                key={agent.id}
                className="flex-row items-center gap-2 py-1.5 px-2 rounded-lg mb-1"
                style={{ backgroundColor: 'rgba(0,0,0,0.02)' }}
              >
                <View
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: agent.color }}
                />
                <View className="flex-1">
                  <Text className="text-xs font-semibold text-ink-dark">
                    {agent.name}
                  </Text>
                  <Text className="text-ink-muted" style={{ fontSize: 9 }}>
                    {agent.statusText || agent.currentState}
                  </Text>
                </View>
                <Text className="text-ink-faint" style={{ fontSize: 8 }}>
                  {agent.role}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

interface ControlButtonProps {
  onPress: () => void;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  fullWidth?: boolean;
}

function ControlButton({ onPress, icon, label, active, fullWidth }: ControlButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center justify-center gap-1.5 py-2 rounded-xl ${fullWidth ? '' : 'flex-1'}`}
      style={{
        backgroundColor: active ? 'rgba(0, 229, 255, 0.08)' : 'rgba(0,0,0,0.03)',
        borderWidth: 1,
        borderColor: active ? 'rgba(0, 229, 255, 0.2)' : 'rgba(0,0,0,0.05)',
        ...(fullWidth ? {} : {}),
      }}
    >
      {icon}
      <Text className="text-xs font-medium text-ink-base">{label}</Text>
    </Pressable>
  );
}
