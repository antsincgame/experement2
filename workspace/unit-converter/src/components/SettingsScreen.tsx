import { YStack, XStack, Text, Switch, Separator, Button } from "tamagui";
import { useSettingsStore } from "@/stores/settingsStore";
import type { SettingsState } from "@/types/index";

interface SettingsScreenProps {
  // No props needed for this component
}

export default function SettingsScreen() {
  const { theme, isMetric, setTheme, setIsMetric } = useSettingsStore();

  return (
    <YStack flex={1} padding="$4" backgroundColor="$background">
      <Text fontSize="$8" fontWeight="bold" color="$color" marginBottom="$4">
        Settings
      </Text>
      
      <YStack backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$4">
        <XStack justifyContent="space-between" alignItems="center" paddingVertical="$3">
          <Text fontSize="$4" color="$color">Theme</Text>
          <Switch 
            size="$4" 
            checked={theme === 'dark'} 
            onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
          >
            <Switch.Thumb animation="bouncy" />
          </Switch>
        </XStack>
        
        <Separator />
        
        <XStack justifyContent="space-between" alignItems="center" paddingVertical="$3">
          <Text fontSize="$4" color="$color">Use Metric Units</Text>
          <Switch 
            size="$4" 
            checked={isMetric} 
            onCheckedChange={setIsMetric}
          >
            <Switch.Thumb animation="bouncy" />
          </Switch>
        </XStack>
      </YStack>
      
      <YStack marginTop="$6" gap="$3">
        <Button 
          backgroundColor="$primary" 
          color="$white"
          size="$4"
          onPress={() => {
            // In a real app, this would reset to default settings
            setTheme('light');
            setIsMetric(true);
          }}
        >
          Reset to Defaults
        </Button>
      </YStack>
    </YStack>
  );
}

// EOF