import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';

import { Text, TextInput } from '../components/Text';
import { Avatar, Button, Field, GradientFill, Icon, IconButton, Input } from '../components/ui';
import type { IconName } from '../components/ui';
import { useQuery } from '../db/client';
import {
  AuthError,
  MIN_PASSWORD_LENGTH,
  getLocalAccount,
  requestPasswordReset,
  resendConfirmation,
  signIn,
  signUp,
} from '../db/queries/auth';
import type { AuthResult } from '../db/queries/auth';
import { pendingChanges } from '../db/queries/cloud';
import type { Account } from '../db/schema';
import { c, font, radius, space } from '../lib/theme';

/**
 * Ce que montre la carte. L'ordre sert au sens du glissement : on avance vers
 * la droite de la liste, on revient vers la gauche.
 */
const MODES = ['welcome', 'signin', 'signup', 'forgot', 'check-email'] as const;
type Mode = (typeof MODES)[number];

/** Le pilote natif n'existe pas sur le web : react-native-web l'ignore en râlant. */
const NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * Connexion au compte en ligne (lot S0). Une carte, une question à la fois, et
 * un titre qui dit ce qui se passe : « Bon retour, Tom », « Connexion »,
 * « Crée ton compte », « Vérifie ta boîte mail ».
 *
 * Le compte suit la personne sur tous ses appareils : sur un appareil neuf, on
 * se connecte et la sync ramène l'historique (voir db/queries/auth.ts).
 */
export default function LoginScreen() {
  const known = useQuery(() => getLocalAccount(), []);
  const [mode, setMode] = useState<Mode>(known ? 'welcome' : 'signup');
  const [email, setEmail] = useState(known?.email ?? '');

  function go(next: Mode, withEmail?: string) {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    if (withEmail !== undefined) setEmail(withEmail);
    setMode(next);
  }

  function afterAuth(result: AuthResult | null, address: string) {
    if (result === 'confirm-email') go('check-email', address);
  }

  // Se connecter avec un autre compte remplace les données de l'appareil :
  // on prévient quand certaines n'existent pas encore en ligne.
  const replacing = known && (!known.remoteId || pendingChanges() > 0) ? known.displayName : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BrandHeader />
          <View style={styles.formCard}>
            <AnimatedSwap
              value={mode === 'welcome' && !known ? 'signin' : mode}
              order={MODES}
              render={(shown) => {
                switch (shown) {
                  case 'welcome':
                    return known ? (
                      <WelcomeBack
                        account={known}
                        onDone={(r) => afterAuth(r, known.email)}
                        onForgot={() => go('forgot', known.email)}
                        onOtherAccount={() => go('signin', '')}
                      />
                    ) : null;
                  case 'signin':
                    return (
                      <SignInForm
                        initialEmail={email}
                        replacing={replacing}
                        onDone={afterAuth}
                        onForgot={(address) => go('forgot', address)}
                        onSignUp={() => go('signup')}
                        onBack={known ? () => go('welcome', known.email) : undefined}
                        backName={known?.displayName}
                      />
                    );
                  case 'signup':
                    return <SignUpForm replacing={replacing} onDone={afterAuth} onSignIn={() => go('signin')} />;
                  case 'forgot':
                    return <ForgotForm initialEmail={email} onBack={() => go(known ? 'welcome' : 'signin')} />;
                  case 'check-email':
                    return (
                      <CheckEmail
                        email={email}
                        onContinue={() => go(known?.email === email ? 'welcome' : 'signin', email)}
                      />
                    );
                }
              }}
            />
          </View>
          <Text style={styles.footnote}>
            Ton compte te suit sur tous tes appareils. Une fois connecté, tes séances restent disponibles même sans
            réseau.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function BrandHeader() {
  return (
    <View style={styles.brand}>
      <ProgressBars />
      <View style={styles.logo}>
        <GradientFill borderRadius={radius.lg} />
        <Icon name="barbell" size={30} color={c.onAccent} />
      </View>
      <Text style={styles.appName} accessibilityRole="header">
        TRAK<Text style={styles.appNameAccent}>R</Text>
      </Text>
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

const SWAP_OFFSET = 28;
/** Marge rendue autour du contenu : le clip ne rogne ni la bordure de focus ni l'ombre des champs. */
const SWAP_BLEED = 4;

/**
 * Change de contenu en deux temps : l'ancien glisse et s'efface vers le côté
 * opposé, puis le nouveau arrive de l'autre côté. La hauteur de la carte suit
 * en douceur — les états n'ont pas la même taille, et un message d'erreur qui
 * apparaît profite du même glissement.
 */
function AnimatedSwap<T extends string>({
  value,
  order,
  render,
}: {
  value: T;
  order: readonly T[];
  render: (shown: T) => ReactNode;
}) {
  const [shown, setShown] = useState(value);
  const progress = useRef(new Animated.Value(1)).current;
  const height = useRef(new Animated.Value(0)).current;
  const [measured, setMeasured] = useState(false);
  // Gardé d'un rendu à l'autre : à l'entrée, `value` et `shown` sont égaux et
  // ne disent plus de quel côté on venait.
  const direction = useRef(1);
  if (value !== shown) direction.current = order.indexOf(value) > order.indexOf(shown) ? 1 : -1;
  const leaving = value !== shown;

  useEffect(() => {
    if (value === shown) {
      Animated.spring(progress, { toValue: 1, speed: 14, bounciness: 5, useNativeDriver: NATIVE_DRIVER }).start();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: 140,
      easing: Easing.in(Easing.quad),
      useNativeDriver: NATIVE_DRIVER,
    }).start(({ finished }) => {
      if (finished) setShown(value);
    });
  }, [value, shown, progress]);

  function onLayout(e: LayoutChangeEvent) {
    const next = e.nativeEvent.layout.height + SWAP_BLEED * 2;
    if (!measured) {
      height.setValue(next);
      setMeasured(true);
      return;
    }
    Animated.timing(height, {
      toValue: next,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }

  const from = (leaving ? -1 : 1) * direction.current * SWAP_OFFSET;

  return (
    <Animated.View style={[styles.swapClip, measured && { height }]}>
      <Animated.View
        onLayout={onLayout}
        style={{
          opacity: progress,
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
          ],
        }}
      >
        {render(shown)}
      </Animated.View>
    </Animated.View>
  );
}

/** « Déjà un compte ? Se connecter » : la question en gris, l'action en accent. */
function SwitchLink({ prompt, action, onPress }: { prompt?: string; action: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.switchLink, pressed && styles.pressed]}
    >
      <Text style={styles.switchPrompt}>
        {prompt ? `${prompt} ` : ''}
        <Text style={styles.switchAction}>{action}</Text>
      </Text>
    </Pressable>
  );
}

function Notice({ icon, children, tone = 'info' }: { icon: IconName; children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <View style={[styles.notice, tone === 'warn' && styles.noticeWarn]}>
      <Icon name={icon} size={18} color={tone === 'warn' ? c.warn : c.accent} />
      <Text style={styles.noticeText}>{children}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */

/** Le compte déjà connu sur cet appareil : son mot de passe suffit. */
function WelcomeBack({
  account,
  onDone,
  onForgot,
  onOtherAccount,
}: {
  account: Account;
  onDone: (result: AuthResult | null) => void;
  onForgot: () => void;
  onOtherAccount: () => void;
}) {
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    const result = await run(() => signIn(account.email, password));
    if (result) return onDone(result.value);
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

      {!account.remoteId ? (
        <Notice icon="cloud-upload-outline">
          Connecte-toi une fois pour sauvegarder ton compte et ta progression en ligne, et les retrouver sur tous tes
          appareils.
        </Notice>
      ) : null}

      <View style={styles.passwordBlock}>
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
        <ForgotLink onPress={onForgot} />
      </View>

      {error ? <ErrorBanner message={error} /> : null}

      <Button
        label={busy ? 'Connexion…' : 'Se connecter'}
        icon="log-in-outline"
        size="lg"
        disabled={busy || !password}
        onPress={submit}
      />

      <SwitchLink prompt={`Pas ${account.displayName} ?`} action="Utiliser un autre compte" onPress={onOtherAccount} />
    </View>
  );
}

/** Connexion depuis n'importe quel appareil. */
function SignInForm({
  initialEmail,
  replacing,
  onDone,
  onForgot,
  onSignUp,
  onBack,
  backName,
}: {
  initialEmail: string;
  replacing: string | null;
  onDone: (result: AuthResult | null, email: string) => void;
  onForgot: (email: string) => void;
  onSignUp: () => void;
  onBack?: () => void;
  backName?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    const result = await run(() => signIn(email, password));
    if (result) onDone(result.value, email.trim().toLowerCase());
  }

  return (
    <View style={styles.form}>
      <View>
        <Text style={styles.formTitle}>Connexion</Text>
        <Text style={styles.formSubtitle}>Retrouve ton compte et ta progression, sur n'importe quel appareil.</Text>
      </View>

      {replacing ? (
        <Notice icon="alert-circle-outline" tone="warn">
          Les séances de {replacing} pas encore sauvegardées en ligne seront retirées de cet appareil.
        </Notice>
      ) : null}

      <EmailField
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={() => passwordRef.current?.focus()}
      />

      <View style={styles.passwordBlock}>
        <Field label="Mot de passe">
          <PasswordInput
            ref={passwordRef}
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        </Field>
        <ForgotLink onPress={() => onForgot(email)} />
      </View>

      {error ? <ErrorBanner message={error} /> : null}

      <Button
        label={busy ? 'Connexion…' : 'Se connecter'}
        icon="log-in-outline"
        size="lg"
        disabled={busy || !email.trim() || !password}
        onPress={submit}
      />

      <SwitchLink prompt="Pas encore de compte ?" action="Créer un compte" onPress={onSignUp} />
      {onBack && backName ? <SwitchLink action={`Revenir au compte de ${backName}`} onPress={onBack} /> : null}
    </View>
  );
}

function SignUpForm({
  replacing,
  onDone,
  onSignIn,
}: {
  replacing: string | null;
  onDone: (result: AuthResult | null, email: string) => void;
  onSignIn: () => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    const result = await run(() => signUp({ displayName, email, password }));
    if (result) onDone(result.value, email.trim().toLowerCase());
  }

  return (
    <View style={styles.form}>
      <View>
        <Text style={styles.formTitle}>Crée ton compte</Text>
        <Text style={styles.formSubtitle}>30 secondes, et ta progression te suit sur tous tes appareils.</Text>
      </View>

      {replacing ? (
        <Notice icon="alert-circle-outline" tone="warn">
          Les séances de {replacing} pas encore sauvegardées en ligne seront retirées de cet appareil.
        </Notice>
      ) : null}

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

      <EmailField
        ref={emailRef}
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={() => passwordRef.current?.focus()}
      />

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
        disabled={busy || !displayName.trim() || !email.trim() || !password}
        onPress={submit}
      />

      <SwitchLink prompt="Déjà un compte ?" action="Se connecter" onPress={onSignIn} />
    </View>
  );
}

function ForgotForm({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useSubmit();

  async function submit() {
    if (await run(() => requestPasswordReset(email))) setSent(true);
  }

  if (sent) {
    return (
      <View style={styles.form}>
        <View style={styles.noticeIcon}>
          <Icon name="mail-unread-outline" size={24} color={c.accent} />
        </View>
        <View>
          <Text style={styles.formTitle}>Lien envoyé</Text>
          <Text style={styles.formSubtitle}>
            Si un compte existe pour {email.trim().toLowerCase()}, tu vas recevoir un lien pour choisir un nouveau mot
            de passe. Pense à regarder dans les indésirables.
          </Text>
        </View>
        <Button label="Retour à la connexion" icon="arrow-back" variant="secondary" size="lg" onPress={onBack} />
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <View>
        <Text style={styles.formTitle}>Mot de passe oublié</Text>
        <Text style={styles.formSubtitle}>Saisis ton e-mail : on t'envoie un lien pour en choisir un nouveau.</Text>
      </View>

      <EmailField value={email} onChangeText={setEmail} onSubmitEditing={submit} returnKeyType="send" />

      {error ? <ErrorBanner message={error} /> : null}

      <Button
        label={busy ? 'Envoi…' : 'Envoyer le lien'}
        icon="paper-plane-outline"
        size="lg"
        disabled={busy || !email.trim()}
        onPress={submit}
      />
      <SwitchLink action="Retour à la connexion" onPress={onBack} />
    </View>
  );
}

/** Après l'inscription : Supabase attend la confirmation de l'adresse. */
function CheckEmail({ email, onContinue }: { email: string; onContinue: () => void }) {
  const [resent, setResent] = useState(false);
  const { busy, error, run } = useSubmit();

  return (
    <View style={styles.form}>
      <View style={styles.noticeIcon}>
        <Icon name="mail-unread-outline" size={24} color={c.accent} />
      </View>
      <View>
        <Text style={styles.formTitle}>Vérifie ta boîte mail</Text>
        <Text style={styles.formSubtitle}>
          On a envoyé un lien de confirmation à {email}. Ouvre-le, puis reviens te connecter ici.
        </Text>
      </View>

      {error ? <ErrorBanner message={error} /> : null}

      <Button label="J'ai confirmé, me connecter" icon="log-in-outline" size="lg" onPress={onContinue} />
      <SwitchLink
        prompt={resent ? 'E-mail renvoyé.' : 'Rien reçu ?'}
        action={busy ? 'Envoi…' : "Renvoyer l'e-mail"}
        onPress={async () => {
          if (await run(() => resendConfirmation(email))) setResent(true);
        }}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */

function EmailField({ ref, ...props }: ComponentPropsWithRef<typeof Input>) {
  return (
    <Field label="E-mail">
      <Input
        ref={ref}
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
        {...props}
        style={styles.input}
      />
    </Field>
  );
}

function ForgotLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.forgot, pressed && styles.pressed]}
    >
      <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
    </Pressable>
  );
}

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
 * en cas de succès, il n'y a rien à faire ici. Renvoie `{ value }` en cas de
 * succès, null en cas d'échec (le message est alors dans `error`).
 */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(action: () => Promise<T>): Promise<{ value: T } | null> {
    if (busy) return null;
    setBusy(true);
    setError(null);
    try {
      const value = await action();
      setBusy(false);
      return { value };
    } catch (e) {
      if (!(e instanceof AuthError)) console.error('[muscu] connexion', e);
      setError(e instanceof AuthError ? e.message : 'Une erreur inattendue est survenue.');
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      setBusy(false);
      return null;
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
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: c.bg,
  },
  appName: { ...font.display, color: c.text, fontSize: 40, letterSpacing: 5, marginTop: space.md },
  // `Text` impose Inter par défaut, même imbriqué : on répète la police display.
  appNameAccent: { ...font.display, color: c.accent },
  tagline: { color: c.textDim, fontSize: 15, marginTop: space.xs, textAlign: 'center' },

  formCard: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: space.xl,
  },
  // Coupe le contenu pendant que la hauteur s'anime.
  swapClip: { overflow: 'hidden', margin: -SWAP_BLEED, padding: SWAP_BLEED },
  form: { gap: space.lg },
  formTitle: { color: c.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  formSubtitle: { color: c.textDim, fontSize: 14, lineHeight: 20, marginTop: 4 },
  welcome: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  noticeIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: c.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    backgroundColor: c.accentDim,
    borderRadius: radius.md,
    padding: space.md,
  },
  noticeWarn: { backgroundColor: '#3A2E10' },
  noticeText: { flex: 1, color: c.text, fontSize: 13, lineHeight: 19 },

  passwordBlock: { gap: space.xs },
  forgot: { alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center' },
  forgotText: { color: c.accent, fontSize: 13, fontWeight: '600' },

  switchLink: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm },
  switchPrompt: { color: c.textDim, fontSize: 14, textAlign: 'center' },
  switchAction: { color: c.accent, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.6 },

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
