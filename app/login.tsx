import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import type { ComponentPropsWithRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';

import { Text, TextInput } from '../components/Text';
import { Avatar, Button, Field, GradientFill, Icon, IconButton, Input } from '../components/ui';
import { useQuery } from '../db/client';
import { AuthError, MIN_PASSWORD_LENGTH, getLocalAccount, signIn, signUp } from '../db/queries/auth';
import type { Account } from '../db/schema';
import { c, radius, space, type } from '../lib/theme';

/**
 * Inscription au premier lancement, connexion ensuite. Un seul compte par
 * appareil tant qu'il n'y a pas de serveur (voir db/queries/auth.ts) : une fois
 * le compte créé, on n'affiche donc plus que son mot de passe.
 */
export default function LoginScreen() {
  const account = useQuery(() => getLocalAccount(), []);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Brand />
          <View style={styles.formCard}>
            {account ? <SignInForm account={account} /> : <SignUpForm />}
          </View>
          <Text style={styles.footnote}>
            Tes données restent sur ce téléphone. Le partage de séances avec tes partenaires
            d'entraînement arrivera avec la synchronisation.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Brand() {
  return (
    <View style={styles.brand}>
      <ProgressBars />
      <View style={styles.logo}>
        <GradientFill borderRadius={radius.xl} />
        <Icon name="barbell" size={30} color="#FFFFFF" />
      </View>
      <Text style={styles.appName}>Muscu Tracker</Text>
      <Text style={styles.tagline}>Note chaque série. Regarde-toi progresser.</Text>
    </View>
  );
}

/** Sept barres qui montent : la courbe que l'app est censée te faire dessiner. */
function ProgressBars() {
  const heights = [18, 26, 22, 34, 40, 38, 54];
  const w = 14;
  const gap = 8;
  const H = 56;
  return (
    // Décor : masqué aux lecteurs d'écran par la View, que react-native-web sait traduire.
    <View style={styles.bars} aria-hidden>
      <Svg width={heights.length * (w + gap) - gap} height={H}>
        {heights.map((h, i) => (
          <Rect
            key={i}
            x={i * (w + gap)}
            y={H - h}
            width={w}
            height={h}
            rx={4}
            fill={i === heights.length - 1 ? c.accent : c.surfaceAlt}
          />
        ))}
      </Svg>
    </View>
  );
}

/* ------------------------------------------------------------------ */

function SignUpForm() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const submit = () => run(() => signUp({ displayName, email, password }));

  return (
    <View style={styles.form}>
      <View>
        <Text style={styles.formTitle}>Crée ton compte</Text>
        <Text style={styles.formSubtitle}>30 secondes, et tu peux lancer ta première séance.</Text>
      </View>

      <Field label="Pseudo">
        <Input
          value={displayName}
          onChangeText={setDisplayName}
          accessibilityLabel="Pseudo"
          placeholder="Ton prénom ou ton surnom"
          autoCapitalize="words"
          autoComplete="nickname"
          textContentType="nickname"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => emailRef.current?.focus()}
          style={styles.input}
        />
      </Field>

      <Field label="E-mail">
        <Input
          ref={emailRef}
          value={email}
          onChangeText={setEmail}
          accessibilityLabel="E-mail"
          placeholder="toi@exemple.fr"
          keyboardType="email-address"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          style={styles.input}
        />
      </Field>

      <Field label="Mot de passe" hint={`${MIN_PASSWORD_LENGTH} caractères minimum`}>
        <PasswordInput
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </Field>

      {error ? <ErrorBanner message={error} /> : null}

      <Button
        label={busy ? 'Création…' : 'Créer mon compte'}
        icon="arrow-forward"
        size="lg"
        disabled={busy}
        onPress={submit}
      />
    </View>
  );
}

function SignInForm({ account }: { account: Account }) {
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    if (await run(() => signIn(account.email, password))) return;
    // La validation a fermé le clavier : on le rouvre sur un champ vide pour réessayer.
    setPassword('');
    passwordRef.current?.focus();
  }

  return (
    <View style={styles.form}>
      <View style={styles.welcome}>
        <Avatar name={account.displayName} size={56} />
        <View style={styles.flex}>
          <Text style={styles.formTitle} numberOfLines={1}>
            Bon retour, {account.displayName}
          </Text>
          <Text style={styles.formSubtitle} numberOfLines={1}>
            {account.email}
          </Text>
        </View>
      </View>

      <Field label="Mot de passe">
        <PasswordInput
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          autoFocus
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </Field>

      {error ? <ErrorBanner message={error} /> : null}

      <Button
        label={busy ? 'Connexion…' : 'Se connecter'}
        icon="log-in-outline"
        size="lg"
        disabled={busy || !password}
        onPress={submit}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */

function PasswordInput({ ref, ...props }: ComponentPropsWithRef<typeof Input>) {
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <Input
        ref={ref}
        {...props}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Mot de passe"
        placeholder="••••••••"
        style={[styles.input, styles.passwordInput]}
      />
      <IconButton
        name={visible ? 'eye-off-outline' : 'eye-outline'}
        accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        onPress={() => setVisible((v) => !v)}
        style={styles.eye}
      />
    </View>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.error} accessibilityRole="alert">
      <Icon name="alert-circle" size={18} color={c.danger} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

/**
 * Le garde de app/_layout.tsx redirige tout seul quand le compte change :
 * en cas de succès, il n'y a rien à faire ici. Renvoie false en cas d'échec.
 */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      if (!(e instanceof AuthError)) console.error('[muscu] connexion', e);
      setError(e instanceof AuthError ? e.message : 'Une erreur inattendue est survenue.');
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      setBusy(false);
      return false;
    }
  }

  return { busy, error, run };
}

const INPUT_HEIGHT = 52;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: c.bg },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: space.xl,
    padding: space.lg,
    paddingVertical: space.xxl,
    // Sur une tablette ou un navigateur desktop, le formulaire garde sa largeur de téléphone.
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },

  brand: { alignItems: 'center' },
  bars: { marginBottom: -20, opacity: 0.9 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: c.bg,
  },
  appName: { ...type.hero, marginTop: space.md },
  tagline: { color: c.textDim, fontSize: 15, marginTop: space.xs, textAlign: 'center' },

  formCard: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    padding: space.xl,
  },
  form: { gap: space.lg },
  formTitle: { ...type.h2 },
  formSubtitle: { color: c.textDim, fontSize: 14, marginTop: 2 },
  welcome: { flexDirection: 'row', alignItems: 'center', gap: space.md },

  input: { minHeight: INPUT_HEIGHT, fontSize: 16 },
  passwordInput: { paddingRight: INPUT_HEIGHT },
  eye: { position: 'absolute', right: 4, top: (INPUT_HEIGHT - 44) / 2 },

  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: c.dangerDim,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
  },
  errorText: { color: c.text, fontSize: 14, flex: 1 },

  footnote: {
    color: c.textFaint,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: space.lg,
  },
});
