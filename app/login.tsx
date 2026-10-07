import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { ComponentPropsWithRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand, TrainingArtwork } from '../components/Brand';
import { Text, TextInput } from '../components/Text';
import { Avatar, Badge, Button, Field, Icon, IconButton, Input } from '../components/ui';
import { useQuery } from '../db/client';
import { AuthError, MIN_PASSWORD_LENGTH, getLocalAccount, signIn, signUp } from '../db/queries/auth';
import type { Account } from '../db/schema';
import { c, font, radius, space, type } from '../lib/theme';

/**
 * Inscription au premier lancement, connexion ensuite. Un seul compte par
 * appareil tant qu'il n'y a pas de serveur (voir db/queries/auth.ts) : une fois
 * le compte créé, on n'affiche donc plus que son mot de passe.
 */
export default function LoginScreen() {
  const account = useQuery(() => getLocalAccount(), []);
  const { width } = useWindowDimensions();
  const wide = width >= 940;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, wide && styles.contentWide]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.intro, wide && styles.introWide]}>
            <View style={styles.brandRow}>
              <Brand size="lg" />
              <View style={styles.status}><View style={styles.statusDot} /><Text style={styles.statusText}>PRÊT HORS LIGNE</Text></View>
            </View>
            <View style={[styles.hero, wide && styles.heroWide]}>
              <View style={[styles.artwork, !wide && styles.artworkMobile]} pointerEvents="none" aria-hidden>
                <TrainingArtwork />
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.eyebrow}>TON SUIVI D'ENTRAÎNEMENT.</Text>
                <Text style={[styles.headline, wide && styles.headlineWide]}>
                  CHAQUE{'\n'}SÉRIE{'\n'}<Text style={styles.headlineAccent}>COMPTE.</Text>
                </Text>
                <Text style={styles.tagline}>Ton effort mérite plus qu'un souvenir.{wide ? '\n' : ' '}Fais-en ta prochaine référence.</Text>
              </View>
              <View style={styles.heroBaseline}><View style={styles.baselineMark} /><Text style={styles.baselineText}>SUIS TA PROGRESSION.</Text></View>
            </View>
            <View style={styles.features}>
              <Feature icon="barbell-outline" label="Chaque série" />
              <Feature icon="trending-up-outline" label="Chaque progrès" />
              <Feature icon="flash-outline" label="Même hors ligne" />
            </View>
          </View>
          <View style={[styles.formColumn, wide && styles.formColumnWide]}>
            <View style={styles.formCard}>
              <View style={styles.formTopline}>
                <Text style={styles.eyebrow}>{account ? 'TON ESPACE PERSONNEL' : 'LE PREMIER PAS'}</Text>
                <Badge label="Compte local" icon="lock-closed-outline" />
              </View>
              {account ? <SignInForm account={account} /> : <SignUpForm />}
              <View style={styles.privacy}>
                <Icon name="shield-checkmark-outline" size={18} color={c.accent} />
                <Text style={styles.privacyText}>Tes entraînements restent sur cet appareil. Aucun compte en ligne nécessaire.</Text>
              </View>
            </View>
            <Text style={styles.footnote}>Un seul compte par appareil. Conserve ton mot de passe : sa récupération n'est pas encore disponible.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Feature({ icon, label }: { icon: 'barbell-outline' | 'trending-up-outline' | 'flash-outline'; label: string }) {
  return (
    <View style={styles.feature}>
      <Icon name={icon} size={17} color={c.accent} />
      <Text style={styles.featureLabel}>{label}</Text>
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
        <Text style={styles.formTitle}>Tout commence ici.</Text>
        <Text style={styles.formSubtitle}>Crée ton espace et donne une nouvelle dimension à tes entraînements.</Text>
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
        label={busy ? 'Création…' : 'Commencer avec Trakr'}
        icon="arrow-forward"
        size="lg"
        disabled={busy || !displayName.trim() || !email.trim() || !password}
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
        label={busy ? 'Connexion…' : 'Reprendre ma progression'}
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
    gap: 28,
    padding: 20,
    paddingVertical: 28,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  contentWide: { flexDirection: 'row', alignItems: 'center', maxWidth: 1260, gap: 72, padding: 48 },
  intro: { gap: 22 },
  introWide: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', maxWidth: 600 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: c.accent },
  statusText: { fontSize: 9, fontWeight: '700', letterSpacing: 1, color: c.textFaint },
  hero: { minHeight: 340, borderRadius: 24, backgroundColor: c.surface, padding: 24, overflow: 'hidden', justifyContent: 'space-between' },
  heroWide: { minHeight: 566, padding: 34, marginTop: 16 },
  artwork: { position: 'absolute', width: 440, height: 440, right: -146, bottom: 26, opacity: 0.8 },
  artworkMobile: { width: 330, height: 330, right: -140, bottom: 20, opacity: 0.55 },
  heroCopy: { alignItems: 'flex-start', gap: 12 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: c.textFaint },
  headline: { ...font.display, fontSize: 65, lineHeight: 60, color: c.text, letterSpacing: -0.5 },
  headlineWide: { fontSize: 104, lineHeight: 93, marginTop: 14 },
  // `Text` impose Inter par défaut, même imbriqué : on répète la police display.
  headlineAccent: { ...font.display, color: c.accent },
  tagline: { color: c.textDim, fontSize: 13, lineHeight: 21, maxWidth: 250, marginTop: 2 },
  heroBaseline: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24 },
  baselineMark: { width: 28, height: 2, backgroundColor: c.accent },
  baselineText: { color: c.textFaint, fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, justifyContent: 'space-between' },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  featureLabel: { color: c.textDim, fontSize: 11 },
  formColumn: { gap: 18 },
  formColumnWide: { width: 414 },
  formCard: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    padding: space.xl,
    borderWidth: 1,
    borderColor: c.border,
    gap: 30,
  },
  formTopline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  form: { gap: space.lg },
  formTitle: { ...type.h2, fontSize: 26, letterSpacing: -1 },
  formSubtitle: { color: c.textDim, fontSize: 13, lineHeight: 21, marginTop: 8 },
  welcome: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  privacy: { flexDirection: 'row', gap: 10, paddingTop: 20, borderTopWidth: 1, borderTopColor: c.border },
  privacyText: { flex: 1, color: c.textDim, fontSize: 11, lineHeight: 17 },

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
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: space.lg,
  },
});
