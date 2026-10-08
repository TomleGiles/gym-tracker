import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../components/Text';
import { Button, Field, Icon, Input, Loading } from '../components/ui';
import { AuthError, MIN_PASSWORD_LENGTH, completePasswordReset } from '../db/queries/auth';
import { supabase } from '../lib/supabase';
import { c, radius, space } from '../lib/theme';

/**
 * Arrivée depuis le lien « mot de passe oublié ». Le client Supabase lit la
 * session de récupération dans l'URL à sa création ; il ne reste qu'à choisir
 * le nouveau mot de passe, ce qui connecte aussi l'appareil au compte.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const [ready, setReady] = useState<'checking' | 'ok' | 'invalid'>('checking');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // getSession attend que le client ait fini de lire l'URL.
    supabase()
      .auth.getSession()
      .then(({ data }) => alive && setReady(data.session ? 'ok' : 'invalid'))
      .catch(() => alive && setReady('invalid'));
    return () => {
      alive = false;
    };
  }, []);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await completePasswordReset(password);
      router.replace('/');
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'Une erreur inattendue est survenue.');
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            {ready === 'checking' ? (
              <Loading label="Vérification du lien…" />
            ) : ready === 'invalid' ? (
              <View style={styles.form}>
                <View style={styles.icon}>
                  <Icon name="time-outline" size={24} color={c.accent} />
                </View>
                <View>
                  <Text style={styles.title}>Lien expiré</Text>
                  <Text style={styles.subtitle}>
                    Ce lien n'est plus valable : il ne sert qu'une fois et expire au bout d'une heure. Redemande-en un
                    depuis l'écran de connexion.
                  </Text>
                </View>
                <Button label="Retour à la connexion" icon="arrow-back" size="lg" onPress={() => router.replace('/login')} />
              </View>
            ) : (
              <View style={styles.form}>
                <View>
                  <Text style={styles.title}>Nouveau mot de passe</Text>
                  <Text style={styles.subtitle}>Choisis-le bien : il te servira sur tous tes appareils.</Text>
                </View>
                <Field label="Mot de passe" hint={`${MIN_PASSWORD_LENGTH} caractères minimum`}>
                  <Input
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    accessibilityLabel="Nouveau mot de passe"
                    placeholder="••••••••"
                    returnKeyType="go"
                    onSubmitEditing={submit}
                    style={styles.input}
                  />
                </Field>
                {error ? (
                  <View style={styles.error} accessibilityRole="alert">
                    <Icon name="alert-circle" size={18} color={c.danger} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}
                <Button
                  label={busy ? 'Enregistrement…' : 'Enregistrer et me connecter'}
                  icon="checkmark"
                  size="lg"
                  disabled={busy || !password}
                  onPress={submit}
                />
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: c.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: space.lg, width: '100%', maxWidth: 440, alignSelf: 'center' },
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: space.xl,
    minHeight: 160,
  },
  form: { gap: space.lg },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: c.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: c.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: c.textDim, fontSize: 14, lineHeight: 20, marginTop: 4 },
  input: { minHeight: 52, fontSize: 16 },
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
});
