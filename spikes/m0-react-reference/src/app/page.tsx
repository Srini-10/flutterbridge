import { LoginScreen } from '@/screens/login-screen';

// MaterialApp(home: LoginScreen(...)) -> app.Route{path: "/"} -> app/page.tsx
export default function Page() {
  return <LoginScreen />;
}
