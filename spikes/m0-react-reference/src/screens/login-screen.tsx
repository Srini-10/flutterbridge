'use client';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// M0-T4 — THE REFERENCE OUTPUT.
//
// This is the hand-written React equivalent of fixtures/apps/hello_bridge/lib/screens/
// login_screen.dart. It is the G2 golden target: at M2-T18, `bridge build` must produce code
// equivalent to this file, and this file is the yardstick that says whether it did.
//
// It is therefore written the way a *generator* would write it — no cleverness a compiler could not
// reproduce, no idiom a compiler could not justify from the UIR.
//
// Flutter -> React mapping, as the frozen spec requires:
//
//   State fields                -> sig.Signal(scope: component) -> useState            (§2.3)
//   setState bodies             -> sig.Action                   -> setter calls        (§2.3)
//   _submit (async)             -> sig.Action(async)            -> async function
//   collection-if               -> UICond                       -> && conditional      (N2)
//   Navigator.push              -> app.Route transition         -> router.push()
//   ThemeData literals          -> app.Token                    -> var(--bridge-*)     (N10)
//   Widgets                     -> runtime kit components                              (ADR-6)
//
// Two constructs in the Dart source have NO representation here, deliberately:
//
//   1. `if (!mounted) return;` — a Flutter State liveness guard. React's cleanup model makes it
//      meaningless; the compiler must DROP it, not translate it. (Finding F-guard, M0-T3 memo.)
//   2. `widget.isDark` / `widget.onToggleTheme` forwarded into HomeScreen through Navigator.push.
//      See ISSUE-1 below. Nothing is decided here.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  AppBar,
  Center,
  CircularProgressIndicator,
  Column,
  ElevatedButton,
  Padding,
  Scaffold,
  SizedBox,
  Text,
  TextField,
} from '@/kit';

export function LoginScreen() {
  const router = useRouter();

  // State fields -> component-scoped signals.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // _submit() -> async action. Each `setState` body becomes the setter calls it assigns, in order.
  const submit = async (): Promise<void> => {
    if (email.length === 0 || password.length === 0) {
      setError('Enter an email and a password.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 400);
    });

    // `if (!mounted) return;` is dropped here — see the header.

    setIsSubmitting(false);

    // Navigator.push(context, MaterialPageRoute(builder: (_) => HomeScreen(...)))
    //
    // ISSUE-1 (open; deferred to the M0-T7 architecture review — do not resolve here):
    // The Dart source forwards `isDark: widget.isDark` and `onToggleTheme: widget.onToggleTheme`
    // to HomeScreen. `onToggleTheme` is a `void Function()`. A closure cannot cross a URL
    // boundary, so those two props CANNOT be passed here. The route transition is all that
    // survives. Recorded in docs/spikes/m0-t3-extraction-fidelity.md §5.
    router.push('/home');
  };

  return (
    <Scaffold appBar={<AppBar title={<Text>Sign in</Text>} />}>
      <Center>
        <Padding padding={24}>
          <Column mainAxisAlignment="center" crossAxisAlignment="stretch">
            <Text style={{ fontSize: 28, fontWeight: 'bold' }}>Hello Bridge</Text>

            <SizedBox height={24} />

            <TextField label="Email" onChanged={setEmail} />

            <SizedBox height={12} />

            <TextField label="Password" obscureText onChanged={setPassword} />

            <SizedBox height={16} />

            {/* collection-if -> UICond */}
            {error.length > 0 && (
              <Padding padding={{ bottom: 12 }}>
                <Text style={{ color: 'var(--bridge-color-error)' }}>{error}</Text>
              </Padding>
            )}

            <SizedBox height={48}>
              {/* `onPressed: _isSubmitting ? null : _submit` — null is Flutter's disabled state. */}
              <ElevatedButton onPressed={isSubmitting ? null : submit}>
                {isSubmitting ? (
                  <SizedBox width={20} height={20}>
                    <CircularProgressIndicator strokeWidth={2} />
                  </SizedBox>
                ) : (
                  <Text>Sign in</Text>
                )}
              </ElevatedButton>
            </SizedBox>
          </Column>
        </Padding>
      </Center>
    </Scaffold>
  );
}
