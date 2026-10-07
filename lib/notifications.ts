import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const REST_CHANNEL = 'rest-timer';

let configured = false;

/**
 * Notification locale de fin de repos. Doit sonner écran verrouillé, donc
 * `shouldPlaySound` + un canal Android à importance haute.
 */
export function configureNotifications(): void {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: false,
    }),
  });

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(REST_CHANNEL, {
      name: 'Chrono de repos',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      sound: 'default',
    }).catch(() => {});
  }
}

let permissionAsked = false;

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (permissionAsked && !current.canAskAgain) return false;
  permissionAsked = true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/**
 * Programme la fin du repos. Renvoie l'identifiant pour pouvoir l'annuler si
 * l'utilisateur enchaîne sa série avant la fin.
 */
export async function scheduleRestEnd(
  seconds: number,
  exerciseLabel: string,
): Promise<string | null> {
  if (seconds <= 0) return null;
  if (!(await ensurePermission())) return null;

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Repos terminé',
        body: `Série suivante : ${exerciseLabel}`,
        sound: 'default',
        ...(Platform.OS === 'android' ? { channelId: REST_CHANNEL } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        channelId: REST_CHANNEL,
      },
    });
  } catch {
    // Une notif ratée ne doit jamais casser une séance.
    return null;
  }
}

export async function cancelRestEnd(id: string | null): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    /* idem */
  }
}

/** Fin d'un cardio lancé au chrono : même canal que le repos, même exigence. */
export async function scheduleCardioEnd(seconds: number, activityLabel: string): Promise<string | null> {
  if (seconds <= 0) return null;
  if (!(await ensurePermission())) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Cardio terminé',
        body: `${activityLabel} : c'est dans la boîte.`,
        sound: 'default',
        ...(Platform.OS === 'android' ? { channelId: REST_CHANNEL } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.round(seconds),
        channelId: REST_CHANNEL,
      },
    });
  } catch {
    return null;
  }
}

