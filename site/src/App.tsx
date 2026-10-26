import { AppShell } from '@/components/AppShell';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MotionProvider } from '@/providers/MotionProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';

export default function App() {
  return (
    <MotionProvider>
      <ThemeProvider>
        <TooltipProvider>
          <AppShell />
        </TooltipProvider>
      </ThemeProvider>
    </MotionProvider>
  );
}
