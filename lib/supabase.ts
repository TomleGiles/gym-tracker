import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/*
 * Client Supabase (lot S0 du spec social) : compte en ligne et sync.
 *
 * Créé à la demande et pas au chargement du module : le build web est rendu en
 * statique, sans `window` ni stockage, et le client lit sa session dès sa
 * création. Rien d'ici n'est appelé pendant la saisie d'une série — l'app
 * reste entièrement utilisable sans réseau une fois connectée.
 */

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  if (!URL || !ANON_KEY) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY manquent dans .env (voir .env.example).');
  }
  client = createClient(URL, ANON_KEY, {
    auth: {
      // Sur le web, AsyncStorage s'appuie sur localStorage ; sur mobile, sur le stockage natif.
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      // Les liens « mot de passe oublié » et de confirmation reviennent avec la session dans l'URL.
      detectSessionInUrl: Platform.OS === 'web',
    },
  });

  // Sur mobile, le rafraîchissement du jeton s'arrête en arrière-plan et reprend au retour.
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') void client?.auth.startAutoRefresh();
      else void client?.auth.stopAutoRefresh();
    });
  }
  return client;
}
