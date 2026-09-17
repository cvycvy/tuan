import { useEffect, type PropsWithChildren } from 'react';
import { LucideTaroProvider } from 'lucide-react-taro';
import '@/app.css';
import { Toaster } from '@/components/ui/toast';
import { ensureLogin } from '@/stores/auth';
import { Preset } from './presets';

const App = ({ children }: PropsWithChildren) => {
  useEffect(() => {
    // 启动时静默登录；失败不阻塞页面，业务调用 ensureLogin 时会再次尝试
    ensureLogin('user').catch(() => {});
  }, []);

  return (
    <LucideTaroProvider defaultColor="#000" defaultSize={24}>
      <Preset>{children}</Preset>
      <Toaster />
    </LucideTaroProvider>
  );
};

export default App;
