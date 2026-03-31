import { View } from 'react-native';
import AgentScene from '@/features/playground/components/agent-scene';

export default function PlaygroundScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#F0F0FF' }}>
      <AgentScene />
    </View>
  );
}
